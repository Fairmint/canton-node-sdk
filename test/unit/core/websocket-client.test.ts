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

  afterEach(() => {
    jest.useRealTimers();
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

  it('does not let a never-settling logger block connection or lifecycle callbacks', async () => {
    const logRequestResponse = jest.fn(async (): Promise<void> => {
      await new Promise<void>(() => undefined);
    });
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse }),
    } as unknown as BaseClient;
    const onOpen = jest.fn();
    const onMessage = jest.fn();
    const onClose = jest.fn();
    let subscription: Awaited<ReturnType<WebSocketClient['connect']>> | undefined;

    void new WebSocketClient(client)
      .connect('/v2/state/active-contracts', { activeAtOffset: 42 }, { onOpen, onMessage, onClose })
      .then((result) => {
        subscription = result;
      });
    await new Promise((resolve) => setImmediate(resolve));

    expect(subscription).toBeDefined();
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('open');
    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { JsActiveContract: {} } })));
    socket.emit('close', 1000, Buffer.from('snapshot complete'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('reports an open handler failure without labeling it a send failure', async () => {
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse }),
    } as unknown as BaseClient;
    const handlerError = new Error('open callback failed');
    const onOpen = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw handlerError;
    });
    const onError = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onOpen, onMessage: jest.fn(), onError }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('open');
    await new Promise((resolve) => setImmediate(resolve));

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ activeAtOffset: 42 }));
    expect(onError).toHaveBeenCalledWith(handlerError);
    expect(socket.close).toHaveBeenCalledWith(1011, 'Open handler failed');
    expect(logRequestResponse).toHaveBeenCalledWith(
      'wss://ledger.example/v2/state/active-contracts',
      expect.objectContaining({ event: 'open_handler_error' }),
      { error: 'open callback failed' }
    );
    expect(logRequestResponse).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: 'send_error' }),
      expect.anything()
    );
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
    const onError = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
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
    const onMessage = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw handlerError;
    });
    const onError = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw new Error('error callback failed');
    });
    const onClose = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage, onError, onClose }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { JsActiveContract: {} } })));
    socket.emit('close', 1000, Buffer.from('server closed'));
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
    expect(onClose).toHaveBeenCalledWith(1000, 'server closed');
    expect(onError.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0] ?? 0);
  });

  it('waits for every in-flight message callback before delivering close', async () => {
    const firstMessage = deferred();
    const secondMessage = deferred();
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse }),
    } as unknown as BaseClient;
    const onMessage = jest
      .fn<Promise<void>, [unknown]>()
      .mockImplementationOnce(async () => firstMessage.promise)
      .mockImplementationOnce(async () => secondMessage.promise);
    const onClose = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage, onClose }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { id: 1 } })));
    socket.emit('message', Buffer.from(JSON.stringify({ contractEntry: { id: 2 } })));
    socket.emit('close', 1000, Buffer.from('snapshot complete'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onClose).not.toHaveBeenCalled();
    firstMessage.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(onClose).not.toHaveBeenCalled();

    secondMessage.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(onClose).toHaveBeenCalledWith(1000, 'snapshot complete');
  });

  it('still closes for token refresh when async refresh callbacks reject', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T04:00:00.000Z'));
    const now = Date.now();
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => now - 120_000,
      getTokenExpiryTime: () => now - 60_000,
      getLogger: () => ({ logRequestResponse }),
    } as unknown as BaseClient;
    const expiringError = new Error('expiring callback failed');
    const refreshError = new Error('refresh callback failed');
    const onTokenExpiring = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw expiringError;
    });
    const onTokenRefreshNeeded = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw refreshError;
    });
    const onError = jest.fn();

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage: jest.fn(), onError },
      { onTokenExpiring, onTokenRefreshNeeded }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    await jest.runOnlyPendingTimersAsync();

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(onTokenRefreshNeeded).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenNthCalledWith(1, expiringError);
    expect(onError).toHaveBeenNthCalledWith(2, refreshError);
    expect(socket.close).toHaveBeenCalledWith(4000, 'Token refresh required');
    expect(logRequestResponse).toHaveBeenCalledWith(
      'wss://ledger.example/v2/state/active-contracts',
      expect.objectContaining({ event: 'token_expiring_handler_error' }),
      { error: 'expiring callback failed' }
    );
    expect(logRequestResponse).toHaveBeenCalledWith(
      'wss://ledger.example/v2/state/active-contracts',
      expect.objectContaining({ event: 'token_refresh_handler_error' }),
      { error: 'refresh callback failed' }
    );
  });

  it('isolates a rejected close callback after delivering the close event', async () => {
    const loggerError = jest.fn();
    const logRequestResponse = jest.fn().mockResolvedValue(undefined);
    const client = {
      getApiUrl: () => 'https://ledger.example',
      authenticate: jest.fn().mockResolvedValue('token'),
      getTokenIssuedAt: () => null,
      getTokenExpiryTime: () => null,
      getLogger: () => ({ logRequestResponse, error: loggerError }),
    } as unknown as BaseClient;
    const closeError = new Error('close callback failed');
    const onClose = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      throw closeError;
    });

    await new WebSocketClient(client).connect(
      '/v2/state/active-contracts',
      { activeAtOffset: 42 },
      { onMessage: jest.fn(), onClose }
    );
    const socket = mockSockets[0];
    if (!socket) throw new Error('Expected WebSocketClient to construct one socket.');

    socket.emit('close', 1000, Buffer.from('snapshot complete'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onClose).toHaveBeenCalledWith(1000, 'snapshot complete');
    expect(loggerError).toHaveBeenCalledWith('WebSocket onClose handler failed', {
      error: closeError.message,
    });
  });
});
