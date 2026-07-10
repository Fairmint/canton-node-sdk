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
});
