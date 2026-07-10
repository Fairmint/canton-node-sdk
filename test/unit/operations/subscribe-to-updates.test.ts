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
          close: jest.fn(),
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
  });
});
