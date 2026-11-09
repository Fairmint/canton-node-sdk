import { z } from 'zod';
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
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('applies a default idle timeout so a silent snapshot stream cannot hang', async () => {
    await new GetActiveContracts({} as never).execute({ parties: ['Alice'], activeAtOffset: 42 });

    expect(mockConnect).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Object), {
      idleTimeoutMs: 600_000,
    });
  });

  it('forwards a caller-supplied idle timeout', async () => {
    await new GetActiveContracts({} as never).execute({ parties: ['Alice'], activeAtOffset: 42, idleTimeoutMs: 0 });

    expect(mockConnect).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Object), {
      idleTimeoutMs: 0,
    });
  });

  it('rejects a null frame without treating it as a contract or Canton error', async () => {
    mockConnect.mockImplementation(
      async (
        _path: string,
        _request: unknown,
        handlers: { onMessage: (message: unknown) => Promise<void> }
      ): Promise<unknown> => {
        await handlers.onMessage(null);
        return {
          close: jest.fn(),
          isConnected: () => false,
          getConnectionState: () => 3,
        };
      }
    );

    await expect(
      new GetActiveContracts({} as never).execute({ parties: ['Alice'], activeAtOffset: 42 })
    ).rejects.toThrow('Unexpected active-contracts WebSocket message');
  });
});

describe('GetActiveContracts any-party', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockConnect.mockImplementation(
      async (_path: string, _request: unknown, handlers: { onClose?: (code: number, reason: string) => void }) => {
        handlers.onClose?.(1000, 'snapshot complete');
        return { close: jest.fn(), isConnected: () => false, getConnectionState: () => 3 };
      }
    );
  });

  it('reads every party through filtersForAnyParty without consulting the client party list', async () => {
    const buildPartyList = jest.fn(() => ['Default']);

    await new GetActiveContracts({ buildPartyList } as never).execute({
      anyParty: true,
      activeAtOffset: 42,
      includeCreatedEventBlob: true,
    });

    expect(buildPartyList).not.toHaveBeenCalled();
    expect(mockConnect.mock.calls[0]?.[1]).toEqual({
      verbose: false,
      activeAtOffset: 42,
      eventFormat: {
        verbose: false,
        filtersByParty: {},
        filtersForAnyParty: {
          cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
        },
      },
    });
  });

  it('rejects anyParty together with parties before connecting', async () => {
    const both = { anyParty: true, parties: ['Alice'], activeAtOffset: 42 } as unknown as Parameters<
      GetActiveContracts['execute']
    >[0];

    await expect(new GetActiveContracts({} as never).execute(both)).rejects.toThrow(
      'pass either anyParty: true or parties, not both'
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('reports a bad filter at its field, as a party-list read always has', async () => {
    const params = { templateIds: 'pkg:Mod:T', activeAtOffset: 42 } as unknown as Parameters<
      GetActiveContracts['execute']
    >[0];

    const error = await new GetActiveContracts({} as never).execute(params).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(z.ZodError);
    expect((error as z.ZodError).issues).toEqual([
      expect.objectContaining({ path: ['templateIds'], code: 'invalid_type', expected: 'array' }),
    ]);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
