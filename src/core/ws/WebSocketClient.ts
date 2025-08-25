import WebSocket, { RawData } from 'ws';
import { BaseClient } from '../BaseClient';

export interface WebSocketSubscription {
	close: () => void;
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
	constructor(private client: BaseClient) {}

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
		// - Application protocol in subprotocol
		const protocols: string[] = ['daml-ledger-api'];

		const socket = new WebSocket(wsUrl, protocols, {
			handshakeTimeout: 30000,
			headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
		});

		socket.on('open', () => {
			try {
				socket.send(JSON.stringify(requestMessage));
				if (handlers.onOpen) handlers.onOpen();
			} catch (err) {
				if (handlers.onError) handlers.onError(err as Error);
				socket.close();
			}
		});

		socket.on('message', (data: RawData) => {
			try {
				const parsed = JSON.parse(data.toString());
				handlers.onMessage(parsed as InboundMessage);
			} catch (err) {
				if (handlers.onError) handlers.onError(err as Error);
			}
		});

		socket.on('error', (err: Error) => {
			if (handlers.onError) handlers.onError(err);
		});

		socket.on('close', (code: number, reason: Buffer) => {
			if (handlers.onClose) handlers.onClose(code, reason.toString());
		});

		return {
			close: () => socket.close(),
		};
	}

	private buildWsUrl(base: string, path: string): string {
		const hasProtocol = base.startsWith('http://') || base.startsWith('https://');
		const normalizedBase = hasProtocol ? base : `https://${base}`;
		const wsBase = normalizedBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
		return `${wsBase}${path}`;
	}
} 