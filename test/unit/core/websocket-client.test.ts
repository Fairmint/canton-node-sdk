import type { EventEmitter } from 'node:events';
import { type BaseClient } from '../../../src/core/BaseClient';
import { WebSocketClient } from '../../../src/core/ws/WebSocketClient';

jest.mock('ws', () => {
  const { EventEmitter: MockEventEmitter } = jest.requireActual<typeof import('node:events')>('node:events');
  const mockSockets: unknown[] = [];

  class MockWebSocket extends MockEventEmitter {
    public static readonly OPEN = 1;
    public readonly close = jest.fn();
    public readonly send = jest.fn();
    public readyState = MockWebSocket.OPEN;

    public constructor(..._args: unknown[]) {
      super();
      mockSockets.push(this);
    }
  }

  return {
    __esModule: true,
    default: MockWebSocket,
    mockSockets,
  };
});

type MockSocket = EventEmitter & {
  readonly close: jest.Mock;
  readonly send: jest.Mock;
  readyState: number;
};

const { mockSockets } = jest.requireMock<{ mockSockets: MockSocket[] }>('ws');

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

describe('WebSocketClient', () => {
  beforeEach(() => {
    mockSockets.length = 0;
  });

  it('dispatches the final message before a close while message logging is pending', async () => {
    const messageLog = deferred();
    const logRequestResponse = jest.fn(async (_url: string, request: { event?: string }): Promise<void> => {
      if (request.event === 'message') {
        await messageLog.promise;
      }
    });
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse }),
    } as unknown as BaseClient;
    const onMessage = jest.fn();
    const onClose = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage, onClose }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { JsActiveContract: {} } })));
    socket.emit('close', 1000, Buffer.from('snapshot complete'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0] ?? 0);

    messageLog.resolve();
  });

  it('does not let logging failures interrupt the stream lifecycle', async () => {
    const loggerError = jest.fn();
    const logRequestResponse = jest.fn().mockRejectedValue(new Error('logger unavailable'));
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse, error: loggerError }),
    } as unknown as BaseClient;
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage, onError, onClose }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { JsActiveContract: {} } })));
    socket.emit('close', 1000, Buffer.from('snapshot complete'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
    for (const event of ['connect', 'message', 'close']) {
      expect(loggerError).toHaveBeenCalledWith('WebSocket request/response logging failed', {
        event,
        error: 'logger unavailable',
      });
    }
  });

  it('closes after invalid JSON even when the error handler throws', async () => {
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const loggerError = jest.fn();
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse, error: loggerError }),
    } as unknown as BaseClient;
    const onError = jest.fn(() => {
      throw new Error('error callback failed');
    });

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage: jest.fn(), onError }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from('{invalid json'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledWith(1003, 'Invalid JSON received');
    expect(logRequestResponse).toHaveBeenCalledWith(
      'wss://ledger.example/v2/state/active-contracts',
      expect.objectContaining({ event: 'parse_error' }),
      expect.objectContaining({ raw: '{invalid json' })
    );
    expect(loggerError).toHaveBeenCalledWith('WebSocket onError handler failed', {
      error: 'error callback failed',
      originalError: expect.any(String),
    });
  });

  it('reports a message handler failure without labeling it invalid JSON', async () => {
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const loggerError = jest.fn();
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse, error: loggerError }),
    } as unknown as BaseClient;
    const handlerError = new Error('consumer failed');
    const onMessage = jest.fn(() => {
      throw handlerError;
    });
    const onError = jest.fn(() => {
      throw new Error('error callback failed');
    });

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage, onError }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { JsActiveContract: {} } })));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledWith(handlerError);
    expect(socket.close).toHaveBeenCalledWith(1011, 'Message handler failed');
    expect(logRequestResponse).toHaveBeenCalledWith(
      'wss://ledger.example/v2/state/active-contracts',
      expect.objectContaining({ event: 'message_handler_error' }),
      { error: 'consumer failed' }
    );
    expect(logRequestResponse).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: 'parse_error' }),
      expect.anything()
    );
    expect(loggerError).toHaveBeenCalledWith('WebSocket onError handler failed', {
      error: 'error callback failed',
      originalError: 'consumer failed',
    });
  });
});
