import { GetActiveContracts } from '../../../src/clients/ledger-json-api/operations/v2/state/get-active-contracts';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

describe('GetActiveContracts', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockConnect.mockImplementation(
      async (_path: string, _request: unknown, handlers: { onClose?: (code: number, reason: string) => void }) => {
        handlers.onClose?.(1000, 'snapshot complete');
        return {
          close: jest.fn(),
          isConnected: () => false,
          getConnectionState: () => 3,
        };
      }
    );
  });

  it('forwards interface filters separately from template filters', async () => {
    const operation = new GetActiveContracts({} as never);

    await expect(
      operation.execute({
        parties: ['Alice'],
        activeAtOffset: 42,
        interfaceIds: ['#token-standard:Splice.Api.Token.HoldingV1:Holding'],
        includeInterfaceView: false,
        includeCreatedEventBlob: true,
      })
    ).resolves.toEqual([]);

    expect(mockConnect).toHaveBeenCalledWith(
      '/v2/state/active-contracts',
      {
        verbose: false,
        activeAtOffset: 42,
        eventFormat: {
          verbose: false,
          filtersByParty: {
            Alice: {
              cumulative: [
                {
                  identifierFilter: {
                    InterfaceFilter: {
                      value: {
                        interfaceId: '#token-standard:Splice.Api.Token.HoldingV1:Holding',
                        includeInterfaceView: false,
                        includeCreatedEventBlob: true,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      expect.any(Object)
    );
  });
});
