import { SubscribeToUpdates } from '../../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-updates';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

describe('SubscribeToUpdates', (): void => {
  beforeEach((): void => {
    mockConnect.mockReset();
  });

  it('rejects an error frame without waiting for a never-settling consumer callback', async (): Promise<void> => {
    const neverSettles = new Promise<void>(() => undefined);
    const close = jest.fn();
    const onMessage = jest.fn(async (): Promise<void> => {
      await neverSettles;
    });
    mockConnect.mockImplementation(
      async (
        _path: string,
        _request: unknown,
        handlers: { onMessage: (message: unknown) => Promise<void> }
      ): Promise<unknown> => {
        void handlers.onMessage({
          code: 'INTERNAL',
          cause: 'stream failed',
          errorCategory: 1,
        });
        return {
          close,
          isConnected: (): boolean => true,
          getConnectionState: (): number => 1,
        };
      }
    );
    const client = {
      buildPartyList: (): string[] => ['Alice'],
      getLedgerEnd: jest.fn().mockResolvedValue({ offset: 42 }),
    };

    await expect(
      new SubscribeToUpdates(client as never).connect({
        beginExclusive: 42,
        onMessage,
      })
    ).rejects.toThrow('WebSocket error [INTERNAL]: stream failed');
    expect(onMessage).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects a null frame without invoking the typed consumer callback', async (): Promise<void> => {
    const onMessage = jest.fn().mockResolvedValue(undefined);
    mockConnect.mockImplementation(
      async (
        _path: string,
        _request: unknown,
        handlers: {
          onMessage: (message: unknown) => Promise<void>;
          onClose?: (code: number, reason: string) => void;
        }
      ): Promise<unknown> => {
        await handlers.onMessage(null);
        handlers.onClose?.(1000, 'stream complete');
        return {
          close: jest.fn(),
          isConnected: (): boolean => false,
          getConnectionState: (): number => 3,
        };
      }
    );
    const client = {
      buildPartyList: (): string[] => ['Alice'],
      getLedgerEnd: jest.fn().mockResolvedValue({ offset: 42 }),
    };

    await expect(new SubscribeToUpdates(client as never).connect({ beginExclusive: 42, onMessage })).rejects.toThrow(
      'Unexpected ledger updates WebSocket message'
    );
    expect(onMessage).not.toHaveBeenCalled();
  });
});
