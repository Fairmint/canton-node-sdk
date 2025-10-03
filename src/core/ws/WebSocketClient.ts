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

/**
 * Minimal WebSocket helper that:
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
		handlers: WebSocketHandlers<InboundMessage, ErrorMessage>
	): Promise<WebSocketSubscription> {
		const baseUrl = this.client.getApiUrl();
		const wsUrl = this.buildWsUrl(baseUrl, path);

		const token = await this.client.authenticate();
		
		// Use standard WebSocket auth pattern:
		// - JWT in Authorization header
		// - Application protocol in subprotocol (daml.ws.auth)
		const protocols: string[] = ['daml.ws.auth'];

		const socket = new WebSocket(wsUrl, protocols, {
			handshakeTimeout: 30000,
			headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
		});

		const logger = this.client.getLogger();
		const log = async (event: string, payload: unknown) => {
			if (logger) {
				await logger.logRequestResponse(wsUrl, { event, requestMessage }, payload);
			}
		};

		await log('connect', { headers: token ? { Authorization: '[REDACTED]' } : undefined, protocols });

		socket.on('open', async () => {
			try {
				socket.send(JSON.stringify(requestMessage));
				await log('send', requestMessage);
				if (handlers.onOpen) handlers.onOpen();
			} catch (err) {
				await log('send_error', err instanceof Error ? { message: err.message } : String(err));
				if (handlers.onError) handlers.onError(err as Error);
				socket.close();
			}
		});

		socket.on('message', async (data: RawData) => {
			try {
				const parsed = WebSocketErrorUtils.safeJsonParse(data.toString(), 'WebSocket message');
				await log('message', parsed);
				handlers.onMessage(parsed as InboundMessage);
			} catch (err) {
				await log('parse_error', { raw: data.toString(), error: err instanceof Error ? err.message : String(err) });
				// Close connection on JSON parse failure to prevent inconsistent state
				socket.close(1003, 'Invalid JSON received');
				if (handlers.onError) handlers.onError(err as Error);
			}
		});

		socket.on('error', async (err: Error) => {
			await log('socket_error', { message: err.message });
			if (handlers.onError) handlers.onError(err);
		});

		socket.on('close', async (code: number, reason: Buffer) => {
			await log('close', { code, reason: reason.toString() });
			if (handlers.onClose) handlers.onClose(code, reason.toString());
		});


		return {
			close: () => {
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