import { calculateTokenRefreshTime } from '@hardlydifficult/websocket';
import WebSocket, { type RawData } from 'ws';
import { type BaseClient } from '../BaseClient';
import { WebSocketErrorUtils } from './WebSocketErrorUtils';

/** Handle returned from a WebSocket connection, used to check status and disconnect. */
export interface WebSocketSubscription {
  /** Closes the WebSocket connection and cleans up resources. */
  readonly close: () => void;
  /** Returns true if the WebSocket is currently open. */
  readonly isConnected: () => boolean;
  /** Returns the raw WebSocket readyState value. */
  readonly getConnectionState: () => number;
}

/** Callbacks for WebSocket lifecycle events. Only `onMessage` is required. */
export interface WebSocketHandlers<Message> {
  readonly onOpen?: () => void | Promise<void>;
  readonly onMessage: (msg: Message) => void | Promise<void>;
  readonly onError?: (err: Error) => void | Promise<void>;
  readonly onClose?: (code: number, reason: string) => void | Promise<void>;
}

/** Converts an unknown error to an Error instance */
function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(typeof value === 'string' ? value : String(value));
}

/** Options for WebSocket token refresh lifecycle. */
export interface WebSocketOptions {
  /**
   * Called when the token is about to expire and refresh is scheduled. Use this to prepare for reconnection (e.g.,
   * track current offset for resumption).
   */
  readonly onTokenExpiring?: () => void | Promise<void>;

  /**
   * Called when token refresh timer fires. The WebSocket will close after this callback returns, and the caller should
   * initiate a new connection with a fresh token. Returns the close code and reason.
   */
  readonly onTokenRefreshNeeded?: () =>
    | { code?: number; reason?: string }
    | void
    | Promise<{ code?: number; reason?: string } | void>;
}

// calculateTokenRefreshTime is imported from @hardlydifficult/websocket
export { calculateTokenRefreshTime } from '@hardlydifficult/websocket';

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

  public async connect<RequestMessage, InboundMessage>(
    path: string,
    requestMessage: RequestMessage,
    handlers: WebSocketHandlers<InboundMessage>,
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
    const reportAuxiliaryFailure = (message: string, context: Record<string, unknown>): void => {
      try {
        logger?.error?.(message, context);
      } catch {
        // A failing logger cannot report its own failure.
      }
    };
    const log = (event: string, payload: unknown): void => {
      if (!logger) return;
      try {
        void Promise.resolve(logger.logRequestResponse(wsUrl, { event, requestMessage }, payload)).catch(
          (err: unknown) => {
            reportAuxiliaryFailure('WebSocket request/response logging failed', {
              event,
              error: toError(err).message,
            });
          }
        );
      } catch (err) {
        // Request/response logging is auxiliary and must not change WebSocket delivery semantics.
        reportAuxiliaryFailure('WebSocket request/response logging failed', {
          event,
          error: toError(err).message,
        });
      }
    };
    const runCallback = async (
      callback: () => void | Promise<void>,
      onFailure: (error: Error) => void,
      onSuccess?: () => void
    ): Promise<void> => {
      try {
        await callback();
        onSuccess?.();
      } catch (err) {
        onFailure(toError(err));
      }
    };
    const observeCallback = (
      callback: () => void | Promise<void>,
      onFailure: (error: Error) => void,
      onSuccess?: () => void
    ): void => {
      void runCallback(callback, onFailure, onSuccess).catch((err: unknown) => {
        reportAuxiliaryFailure('WebSocket callback failure handling failed', { error: toError(err).message });
      });
    };
    const notifyError = (error: Error): void => {
      const { onError } = handlers;
      if (!onError) return;
      observeCallback(
        (): void | Promise<void> => onError(error),
        (err) => {
          reportAuxiliaryFailure('WebSocket onError handler failed', {
            error: err.message,
            originalError: error.message,
          });
        }
      );
    };
    let inFlightMessageCallbacks = 0;
    let resolveMessageCallbacksDrained: (() => void) | undefined;
    let messageCallbacksDrained = Promise.resolve();
    const beginMessageCallback = (): void => {
      if (inFlightMessageCallbacks === 0) {
        messageCallbacksDrained = new Promise<void>((resolve) => {
          resolveMessageCallbacksDrained = resolve;
        });
      }
      inFlightMessageCallbacks += 1;
    };
    const completeMessageCallback = (): void => {
      inFlightMessageCallbacks -= 1;
      if (inFlightMessageCallbacks === 0) {
        resolveMessageCallbacksDrained?.();
        resolveMessageCallbacksDrained = undefined;
      }
    };

    log('connect', { headers: token ? { Authorization: '[REDACTED]' } : undefined, protocols });

    // Schedule proactive token refresh if we have token timing and callbacks
    if (tokenIssuedAt !== null && tokenExpiresAt !== null && options?.onTokenRefreshNeeded) {
      const refreshTime = calculateTokenRefreshTime(tokenIssuedAt, tokenExpiresAt);
      const delayMs = Math.max(0, refreshTime - Date.now());

      log('token_refresh_scheduled', {
        tokenIssuedAt: new Date(tokenIssuedAt).toISOString(),
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
        refreshAt: new Date(refreshTime).toISOString(),
        delayMs,
      });

      tokenRefreshTimer = setTimeout(() => {
        tokenRefreshTimer = null;
        void (async () => {
          if (options.onTokenExpiring) {
            observeCallback(options.onTokenExpiring, (error) => {
              notifyError(error);
              log('token_expiring_handler_error', { error: error.message });
            });
          }

          log('token_refresh_triggered', { reason: 'proactive_refresh' });

          let closeCode = 4000;
          let closeReason = 'Token refresh required';
          try {
            const closeParams = await options.onTokenRefreshNeeded?.();
            closeCode = closeParams?.code ?? closeCode;
            closeReason = closeParams?.reason ?? closeReason;
          } catch (err) {
            const error = toError(err);
            notifyError(error);
            log('token_refresh_handler_error', { error: error.message });
          }

          try {
            socket.close(closeCode, closeReason);
          } catch (err) {
            const error = toError(err);
            notifyError(error);
            log('token_refresh_close_error', { error: error.message });
          }
        })().catch((err: unknown) => {
          const error = toError(err);
          notifyError(error);
          log('token_refresh_error', { error: error.message });
          try {
            socket.close(4000, 'Token refresh required');
          } catch {
            // The original refresh failure was already reported.
          }
        });
      }, delayMs);
    }

    socket.on('open', () => {
      try {
        socket.send(JSON.stringify(requestMessage));
        log('send', requestMessage);
      } catch (err) {
        const error = toError(err);
        log('send_error', { message: error.message });
        notifyError(error);
        socket.close();
        return;
      }

      if (handlers.onOpen) {
        observeCallback(handlers.onOpen, (error) => {
          notifyError(error);
          socket.close(1011, 'Open handler failed');
          log('open_handler_error', { error: error.message });
        });
      }
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
      let parsed: unknown;
      try {
        parsed = WebSocketErrorUtils.safeJsonParse(dataString, 'WebSocket message');
      } catch (err) {
        const error = toError(err);
        notifyError(error);
        socket.close(1003, 'Invalid JSON received');
        log('parse_error', { raw: dataString, error: error.message });
        return;
      }

      beginMessageCallback();

      void runCallback(
        (): void | Promise<void> => handlers.onMessage(parsed as InboundMessage),
        (error) => {
          notifyError(error);
          socket.close(1011, 'Message handler failed');
          log('message_handler_error', { error: error.message });
        },
        () => log('message', parsed)
      )
        .catch((err: unknown) => {
          reportAuxiliaryFailure('WebSocket message callback failure handling failed', {
            error: toError(err).message,
          });
        })
        .finally(completeMessageCallback);
    });

    socket.on('error', (err: Error) => {
      log('socket_error', { message: err.message });
      notifyError(err);
    });

    socket.on('close', (code: number, reason: Buffer) => {
      // Clear token refresh timer on close
      if (tokenRefreshTimer !== null) {
        clearTimeout(tokenRefreshTimer);
        tokenRefreshTimer = null;
      }
      const closeReason = reason.toString();
      log('close', { code, reason: closeReason });
      const { onClose } = handlers;
      if (onClose) {
        void messageCallbacksDrained.then(() => {
          observeCallback(
            (): void | Promise<void> => onClose(code, closeReason),
            (error) => {
              reportAuxiliaryFailure('WebSocket onClose handler failed', { error: error.message });
            }
          );
        });
      }
    });

    return {
      close: () => {
        // Clear token refresh timer
        if (tokenRefreshTimer !== null) {
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
