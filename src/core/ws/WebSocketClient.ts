import WebSocket, { type RawData } from 'ws';
import { type BaseClient } from '../BaseClient';
import { WebSocketErrorUtils } from './WebSocketErrorUtils';

export interface WebSocketSubscription {
  close: () => void;
  isConnected: () => boolean;
  getConnectionState: () => number;
}

export interface WebSocketHandlers<Message, ErrorMessage = unknown> {
  onOpen?: () => void;
  onMessage: (msg: Message) => void;
  onError?: (err: Error | ErrorMessage) => void;
  onClose?: (code: number, reason: string) => void;
}

/** Converts an unknown error to an Error instance */
function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(typeof value === 'string' ? value : String(value));
}

export interface WebSocketOptions {
  /**
   * Called when the token is about to expire and refresh is scheduled. Use this to prepare for reconnection (e.g.,
   * track current offset for resumption).
   */
  onTokenExpiring?: () => void;

  /**
   * Called when token refresh timer fires. The WebSocket will close after this callback returns, and the caller should
   * initiate a new connection with a fresh token. Returns the close code and reason.
   */
  onTokenRefreshNeeded?: () => { code?: number; reason?: string } | void;
}

/**
 * Calculate when to schedule token refresh. Uses the later of:
 *
 * - 50% of token lifetime (protects short-lived tokens)
 * - 2 minutes before expiry (ensures adequate buffer for longer tokens)
 *
 * Examples:
 *
 * - 60-second token: refresh at 30s (50% rule wins)
 * - 5-minute token: refresh at 3min (2-min buffer wins)
 * - 1-hour token: refresh at 58min (2-min buffer wins)
 *
 * @param tokenIssuedAt - Timestamp when token was issued (ms since epoch)
 * @param tokenExpiresAt - Timestamp when token expires (ms since epoch)
 * @returns Timestamp when refresh should be scheduled (ms since epoch)
 */
export function calculateTokenRefreshTime(tokenIssuedAt: number, tokenExpiresAt: number): number {
  const lifetimeMs = tokenExpiresAt - tokenIssuedAt;
  const twoMinutesMs = 2 * 60 * 1000;

  const halfLifetime = tokenIssuedAt + Math.floor(lifetimeMs / 2);
  const twoMinutesBefore = tokenExpiresAt - twoMinutesMs;

  return Math.max(halfLifetime, twoMinutesBefore);
}

/**
 * Minimal WebSocket helper that:
 *
 * - Upgrades http(s) URL to ws(s)
 * - Auth via Authorization header (standard approach)
 * - Uses 'daml-ledger-api' subprotocol
 * - Sends an initial request message
 * - Dispatches parsed messages to user handlers
 */
export class WebSocketClient {
  constructor(private readonly client: BaseClient) {}

  public async connect<RequestMessage, InboundMessage, ErrorMessage = unknown>(
    path: string,
    requestMessage: RequestMessage,
    handlers: WebSocketHandlers<InboundMessage, ErrorMessage>,
    options?: WebSocketOptions
  ): Promise<WebSocketSubscription> {
    const baseUrl = this.client.getApiUrl();
    const wsUrl = this.buildWsUrl(baseUrl, path);

    const token = await this.client.authenticate();

    // Get token timing for proactive refresh scheduling
    const tokenIssuedAt = this.client.getTokenIssuedAt();
    const tokenExpiresAt = this.client.getTokenExpiryTime();

    // Use standard WebSocket auth pattern:
    // - JWT in Authorization header
    // - Application protocol in subprotocol (daml.ws.auth)
    const protocols: string[] = ['daml.ws.auth'];

    const socket = new WebSocket(wsUrl, protocols, {
      handshakeTimeout: 30000,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    // Token refresh timer handle (cleared on close)
    let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const logger = this.client.getLogger();
    const log = async (event: string, payload: unknown) => {
      if (logger) {
        await logger.logRequestResponse(wsUrl, { event, requestMessage }, payload);
      }
    };

    await log('connect', { headers: token ? { Authorization: '[REDACTED]' } : undefined, protocols });

    // Schedule proactive token refresh if we have token timing and callbacks
    if (tokenIssuedAt !== null && tokenExpiresAt !== null && options?.onTokenRefreshNeeded) {
      const refreshTime = calculateTokenRefreshTime(tokenIssuedAt, tokenExpiresAt);
      const delayMs = Math.max(0, refreshTime - Date.now());

      if (delayMs > 0) {
        await log('token_refresh_scheduled', {
          tokenIssuedAt: new Date(tokenIssuedAt).toISOString(),
          tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
          refreshAt: new Date(refreshTime).toISOString(),
          delayMs,
        });

        tokenRefreshTimer = setTimeout(() => {
          void (async () => {
            // Notify that token is expiring
            if (options.onTokenExpiring) {
              options.onTokenExpiring();
            }

            await log('token_refresh_triggered', { reason: 'proactive_refresh' });

            // Get close params from callback
            const closeParams = options.onTokenRefreshNeeded?.();
            const closeCode = closeParams?.code ?? 4000;
            const closeReason = closeParams?.reason ?? 'Token refresh required';

            // Close the socket to trigger reconnection from the caller
            socket.close(closeCode, closeReason);
          })();
        }, delayMs);
      }
    }

    socket.on('open', () => {
      void (async () => {
        try {
          socket.send(JSON.stringify(requestMessage));
          await log('send', requestMessage);
          if (handlers.onOpen) handlers.onOpen();
        } catch (err) {
          const error = toError(err);
          await log('send_error', { message: error.message });
          if (handlers.onError) handlers.onError(error);
          socket.close();
        }
      })();
    });

    socket.on('message', (rawData: RawData) => {
      // Convert RawData to string safely
      let dataString: string;
      if (Buffer.isBuffer(rawData)) {
        dataString = rawData.toString('utf8');
      } else if (Array.isArray(rawData)) {
        dataString = Buffer.concat(rawData).toString('utf8');
      } else {
        dataString = new TextDecoder().decode(rawData);
      }
      void (async () => {
        try {
          const parsed = WebSocketErrorUtils.safeJsonParse(dataString, 'WebSocket message');
          await log('message', parsed);

          handlers.onMessage(parsed as InboundMessage);
        } catch (err) {
          const error = toError(err);
          await log('parse_error', { raw: dataString, error: error.message });
          // Close connection on JSON parse failure to prevent inconsistent state
          socket.close(1003, 'Invalid JSON received');
          if (handlers.onError) handlers.onError(error);
        }
      })();
    });

    socket.on('error', (err: Error) => {
      void (async () => {
        await log('socket_error', { message: err.message });
        if (handlers.onError) handlers.onError(err);
      })();
    });

    socket.on('close', (code: number, reason: Buffer) => {
      void (async () => {
        // Clear token refresh timer on close
        if (tokenRefreshTimer) {
          clearTimeout(tokenRefreshTimer);
          tokenRefreshTimer = null;
        }
        await log('close', { code, reason: reason.toString() });
        if (handlers.onClose) handlers.onClose(code, reason.toString());
      })();
    });

    return {
      close: () => {
        // Clear token refresh timer
        if (tokenRefreshTimer) {
          clearTimeout(tokenRefreshTimer);
          tokenRefreshTimer = null;
        }
        // Remove all event listeners to prevent memory leaks
        socket.removeAllListeners();
        socket.close();
      },
      isConnected: () => socket.readyState === WebSocket.OPEN,
      getConnectionState: () => socket.readyState,
    };
  }

  private buildWsUrl(base: string, path: string): string {
    const hasProtocol = base.startsWith('http://') || base.startsWith('https://');
    const normalizedBase = hasProtocol ? base : `https://${base}`;
    const wsBase = normalizedBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return `${wsBase}${path}`;
  }
}
