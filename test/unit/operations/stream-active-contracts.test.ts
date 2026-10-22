import { GetActiveContracts } from '../../../src/clients/ledger-json-api/operations/v2/state/get-active-contracts';
import {
  ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK,
  StreamActiveContracts,
  type StreamActiveContractsParams,
} from '../../../src/clients/ledger-json-api/operations/v2/state/stream-active-contracts';
import {
  JsGetActiveContractsResponseItemSchema,
  type JsGetActiveContractsResponseItem,
} from '../../../src/clients/ledger-json-api/schemas/api/state';
import { ApiError } from '../../../src/core/errors';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

const PARTY = 'Alice::fingerprint';
const HOLDING_INTERFACE_ID = '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding';

interface Handlers {
  readonly onMessage: (message: unknown) => void | Promise<void>;
  readonly onError?: (error: Error) => void | Promise<void>;
  readonly onClose?: (code: number, reason: string) => void | Promise<void>;
}

interface Subscription {
  readonly close: jest.Mock;
  readonly pause: jest.Mock;
  readonly resume: jest.Mock;
  readonly isConnected: () => boolean;
  readonly getConnectionState: () => number;
}

interface Connection {
  readonly handlers: Handlers;
  readonly subscription: Subscription;
}

let connections: Connection[] = [];

/** Wire frame for one active contract, as the participant sends it. */
function activeContractFrame(contractId: string): Record<string, unknown> {
  return {
    workflowId: '',
    contractEntry: {
      JsActiveContract: {
        synchronizerId: 'global-domain::fingerprint',
        reassignmentCounter: 0,
        createdEvent: {
          offset: 7,
          nodeId: 0,
          contractId,
          templateId: `${'12'.repeat(32)}:Splice.Amulet:Amulet`,
          contractKey: null,
          createArgument: { owner: PARTY },
          createdEventBlob: '',
          interfaceViews: [],
          witnessParties: [PARTY],
          signatories: [PARTY],
          observers: [],
          createdAt: '2026-10-22T12:00:00.000000Z',
          packageName: 'splice-amulet',
        },
      },
    },
  };
}

/** The item the operation yields for {@link activeContractFrame}. */
function activeContractItem(contractId: string): JsGetActiveContractsResponseItem {
  return JsGetActiveContractsResponseItemSchema.parse(activeContractFrame(contractId));
}

const CANTON_ERROR_FRAME = { code: 'PERMISSION_DENIED', cause: 'party not hosted', errorCategory: 7 };

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function lastConnection(): Connection {
  const connection = connections[connections.length - 1];
  if (!connection) throw new Error('Expected the stream to connect.');
  return connection;
}

function stream(
  params: StreamActiveContractsParams = { parties: [PARTY], activeAtOffset: 42 }
): AsyncGenerator<JsGetActiveContractsResponseItem, void, undefined> {
  return new StreamActiveContracts({} as never).execute(params);
}

/** Starts a stream and waits until it has connected; `first` is the pending first `next()`. */
async function startStream(params?: StreamActiveContractsParams): Promise<{
  readonly items: AsyncGenerator<JsGetActiveContractsResponseItem, void, undefined>;
  readonly first: Promise<IteratorResult<JsGetActiveContractsResponseItem, void>>;
  readonly connection: Connection;
}> {
  const items = stream(params);
  const first = items.next();
  await flush();
  return { items, first, connection: lastConnection() };
}

describe('StreamActiveContracts', () => {
  beforeEach(() => {
    connections = [];
    mockConnect.mockReset();
    mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers) => {
      const subscription: Subscription = {
        close: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        isConnected: () => true,
        getConnectionState: () => 1,
      };
      connections.push({ handlers, subscription });
      return subscription;
    });
  });

  it('connects only when the first item is requested', async () => {
    const items = stream();
    await flush();
    expect(mockConnect).not.toHaveBeenCalled();

    const first = items.next();
    await flush();
    expect(mockConnect).toHaveBeenCalledTimes(1);

    void lastConnection().handlers.onClose?.(1000, 'snapshot complete');
    await expect(first).resolves.toEqual({ done: true, value: undefined });
  });

  it('yields each item in order as it arrives, before the snapshot ends', async () => {
    const { items, first, connection } = await startStream();

    void connection.handlers.onMessage(activeContractFrame('00a'));
    await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });

    const second = items.next();
    await flush();
    void connection.handlers.onMessage(activeContractFrame('00b'));
    void connection.handlers.onMessage(activeContractFrame('00c'));
    await expect(second).resolves.toEqual({ done: false, value: activeContractItem('00b') });
    await expect(items.next()).resolves.toEqual({ done: false, value: activeContractItem('00c') });

    const end = items.next();
    await flush();
    expect(connection.subscription.close).not.toHaveBeenCalled();
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    await expect(end).resolves.toEqual({ done: true, value: undefined });
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
  });

  it('holds at most the high-water mark: it pauses the socket there and resumes once half are taken', async () => {
    const { items, first, connection } = await startStream();
    const total = ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK + 10;

    for (let index = 0; index < ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK; index += 1) {
      void connection.handlers.onMessage(activeContractFrame(`00${index}`));
    }
    expect(connection.subscription.pause).toHaveBeenCalledTimes(1);

    const yielded: string[] = [];
    const take = async (result: Promise<IteratorResult<JsGetActiveContractsResponseItem, void>>): Promise<void> => {
      const { done, value } = await result;
      if (done === true || !('JsActiveContract' in value.contractEntry)) throw new Error('Expected an active contract');
      yielded.push(value.contractEntry.JsActiveContract.createdEvent.contractId);
    };

    await take(first);
    while (yielded.length < ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK / 2 - 1) {
      await take(items.next());
    }
    expect(connection.subscription.resume).not.toHaveBeenCalled();
    await take(items.next());
    expect(connection.subscription.resume).toHaveBeenCalledTimes(1);

    // Frames the socket had already read keep arriving after resume and are queued behind the rest.
    for (let index = ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK; index < total; index += 1) {
      void connection.handlers.onMessage(activeContractFrame(`00${index}`));
    }
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    for (;;) {
      const result = await items.next();
      if (result.done === true) break;
      await take(Promise.resolve(result));
    }

    expect(yielded).toEqual(Array.from({ length: total }, (_, index) => `00${index}`));
    expect(connection.subscription.pause).toHaveBeenCalledTimes(1);
  });

  it('rejects after yielding the items received before a Canton error frame', async () => {
    const { items, first, connection } = await startStream();

    void connection.handlers.onMessage(activeContractFrame('00a'));
    void connection.handlers.onMessage(activeContractFrame('00b'));
    // Throwing tells WebSocketClient to close the socket.
    expect(() => {
      void connection.handlers.onMessage(CANTON_ERROR_FRAME);
    }).toThrow('WebSocket error [PERMISSION_DENIED]: party not hosted');
    // Frames after the error are not delivered.
    void connection.handlers.onMessage(activeContractFrame('00c'));

    await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });
    await expect(items.next()).resolves.toEqual({ done: false, value: activeContractItem('00b') });
    const failure = items.next();
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow('WebSocket error [PERMISSION_DENIED]: party not hosted');
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
    await expect(items.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it.each([
    ['a null frame', null],
    ['a frame that matches no message', { unexpected: true }],
  ])('rejects %s', async (_label, frame) => {
    const { first, connection } = await startStream();

    expect(() => {
      void connection.handlers.onMessage(frame);
    }).toThrow('Unexpected active-contracts WebSocket message');

    await expect(first).rejects.toThrow('Unexpected active-contracts WebSocket message');
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
  });

  it('rejects with a socket error, such as the idle timeout, after yielding the items before it', async () => {
    const { items, first, connection } = await startStream();

    void connection.handlers.onMessage(activeContractFrame('00a'));
    void connection.handlers.onError?.(new Error('WebSocket idle timeout: no message received for 600000ms'));
    void connection.handlers.onClose?.(4008, 'WebSocket idle timeout');

    await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });
    await expect(items.next()).rejects.toThrow('WebSocket idle timeout: no message received for 600000ms');
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
  });

  it('closes the socket and stops delivery when the consumer breaks out early', async () => {
    mockConnect.mockImplementationOnce(async (_path: string, _request: unknown, handlers: Handlers) => {
      const subscription: Subscription = {
        close: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        isConnected: () => true,
        getConnectionState: () => 1,
      };
      connections.push({ handlers, subscription });
      setImmediate(() => {
        void handlers.onMessage(activeContractFrame('00a'));
        void handlers.onMessage(activeContractFrame('00b'));
      });
      return subscription;
    });
    const items = stream();

    const seen: JsGetActiveContractsResponseItem[] = [];
    for await (const item of items) {
      seen.push(item);
      break;
    }

    const { handlers, subscription } = lastConnection();
    expect(seen).toEqual([activeContractItem('00a')]);
    expect(subscription.close).toHaveBeenCalledTimes(1);
    expect(() => {
      void handlers.onMessage(activeContractFrame('00c'));
    }).not.toThrow();
    await expect(items.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('closes the socket when the consumer throws inside the loop', async () => {
    const { items, first, connection } = await startStream();
    void connection.handlers.onMessage(activeContractFrame('00a'));
    await first;

    const consume = async (): Promise<void> => {
      void connection.handlers.onMessage(activeContractFrame('00b'));
      for await (const item of items) {
        throw new Error(`consumer failed on ${JSON.stringify(item.workflowId)}`);
      }
    };

    await expect(consume()).rejects.toThrow('consumer failed');
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed connection without a socket to close', async () => {
    mockConnect.mockRejectedValueOnce(new Error('authentication failed'));

    await expect(stream().next()).rejects.toThrow('authentication failed');
  });

  it('applies the default idle timeout and forwards a caller-supplied one', async () => {
    const { first, connection } = await startStream();
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    await first;
    const override = await startStream({ parties: [PARTY], activeAtOffset: 42, idleTimeoutMs: 0 });
    void override.connection.handlers.onClose?.(1000, 'snapshot complete');
    await override.first;

    expect(mockConnect).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Object), expect.any(Object), {
      idleTimeoutMs: 600_000,
    });
    expect(mockConnect).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(Object), expect.any(Object), {
      idleTimeoutMs: 0,
    });
  });

  it('sends an interface filter with views and created-event blobs beside a template filter', async () => {
    const { first, connection } = await startStream({
      parties: [PARTY],
      activeAtOffset: 42,
      templateIds: ['#splice-wallet:Splice.Wallet.Install:WalletAppInstall'],
      interfaceIds: [HOLDING_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: true,
    });
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    await first;

    expect(mockConnect).toHaveBeenCalledWith(
      '/v2/state/active-contracts',
      {
        verbose: false,
        activeAtOffset: 42,
        eventFormat: {
          verbose: false,
          filtersByParty: {
            [PARTY]: {
              cumulative: [
                {
                  identifierFilter: {
                    TemplateFilter: {
                      value: {
                        templateId: '#splice-wallet:Splice.Wallet.Install:WalletAppInstall',
                        includeCreatedEventBlob: true,
                      },
                    },
                  },
                },
                {
                  identifierFilter: {
                    InterfaceFilter: {
                      value: {
                        interfaceId: HOLDING_INTERFACE_ID,
                        includeInterfaceView: true,
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

  it('defaults the offset to the ledger end and the parties to the client', async () => {
    const client = {
      getLedgerEnd: jest.fn().mockResolvedValue({ offset: 99 }),
      buildPartyList: () => ['Bob::fingerprint'],
    };
    const items = new StreamActiveContracts(client as never).execute({});
    const first = items.next();
    await flush();
    void lastConnection().handlers.onClose?.(1000, 'snapshot complete');
    await first;

    expect(client.getLedgerEnd).toHaveBeenCalledWith({});
    expect(mockConnect).toHaveBeenCalledWith(
      '/v2/state/active-contracts',
      expect.objectContaining({
        activeAtOffset: 99,
        eventFormat: expect.objectContaining({ filtersByParty: { 'Bob::fingerprint': expect.any(Object) } }),
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});

describe('GetActiveContracts beside the stream', () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it('still collects every item in order and calls onItem for each', async () => {
    mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers) => {
      await handlers.onMessage(activeContractFrame('00a'));
      await handlers.onMessage(activeContractFrame('00b'));
      await handlers.onClose?.(1000, 'snapshot complete');
      return { close: jest.fn(), isConnected: () => false, getConnectionState: () => 3 };
    });
    const onItem = jest.fn();

    await expect(
      new GetActiveContracts({} as never).execute({ parties: [PARTY], activeAtOffset: 42, onItem })
    ).resolves.toEqual([activeContractItem('00a'), activeContractItem('00b')]);
    expect(onItem.mock.calls).toEqual([[activeContractItem('00a')], [activeContractItem('00b')]]);
  });

  it('still rejects on a Canton error frame', async () => {
    mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers) => {
      await expect(handlers.onMessage(CANTON_ERROR_FRAME)).rejects.toThrow('WebSocket error [PERMISSION_DENIED]');
      return { close: jest.fn(), isConnected: () => false, getConnectionState: () => 3 };
    });

    await expect(new GetActiveContracts({} as never).execute({ parties: [PARTY], activeAtOffset: 42 })).rejects.toThrow(
      'WebSocket error [PERMISSION_DENIED]: party not hosted'
    );
  });
});
