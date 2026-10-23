import { GetActiveContracts } from '../../../src/clients/ledger-json-api/operations/v2/state/get-active-contracts';
import {
  ACTIVE_CONTRACTS_STREAM_HIGH_WATER_MARK,
  StreamActiveContracts,
  type ActiveContractsStream,
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

type Items = AsyncIterator<JsGetActiveContractsResponseItem, void, undefined>;

const ONLY_ONCE = 'An active-contracts stream can be iterated only once';

function stream(params: StreamActiveContractsParams = { parties: [PARTY], activeAtOffset: 42 }): ActiveContractsStream {
  return new StreamActiveContracts({} as never).execute(params);
}

/** Starts iterating a stream and waits until it has connected; `first` is the pending first `next()`. */
async function startStream(params?: StreamActiveContractsParams): Promise<{
  readonly snapshot: ActiveContractsStream;
  readonly items: Items;
  readonly first: Promise<IteratorResult<JsGetActiveContractsResponseItem, void>>;
  readonly connection: Connection;
}> {
  const snapshot = stream(params);
  const items = snapshot[Symbol.asyncIterator]();
  const first = items.next();
  await flush();
  return { snapshot, items, first, connection: lastConnection() };
}

/** Makes the next connection deliver `frames`, then close with `closeCode` if one is given. */
function connectDelivering(frames: readonly unknown[], closeCode?: number): void {
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
      for (const frame of frames) {
        void handlers.onMessage(frame);
      }
      if (closeCode !== undefined) {
        void handlers.onClose?.(closeCode, '');
      }
    });
    return subscription;
  });
}

/** Contract IDs of the active contracts in a full iteration of `snapshot`. */
async function readContractIds(snapshot: ActiveContractsStream): Promise<string[]> {
  const ids: string[] = [];
  for await (const item of snapshot) {
    if ('JsActiveContract' in item.contractEntry) {
      ids.push(item.contractEntry.JsActiveContract.createdEvent.contractId);
    }
  }
  return ids;
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
    const items = stream()[Symbol.asyncIterator]();
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
    // A failed iterator keeps failing instead of reporting the snapshot as done.
    await expect(items.next()).rejects.toThrow('WebSocket error [PERMISSION_DENIED]: party not hosted');
    expect(mockConnect).toHaveBeenCalledTimes(1);
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

  it.each([
    [1006, '', 'Active-contracts stream closed before the snapshot completed [1006]'],
    [1001, 'going away', 'Active-contracts stream closed before the snapshot completed [1001]: going away'],
  ])(
    'rejects after yielding the items received before a close with code %i and no error',
    async (code, reason, message) => {
      const { items, first, connection } = await startStream();

      void connection.handlers.onMessage(activeContractFrame('00a'));
      void connection.handlers.onMessage(activeContractFrame('00b'));
      void connection.handlers.onClose?.(code, reason);

      await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });
      await expect(items.next()).resolves.toEqual({ done: false, value: activeContractItem('00b') });
      const failure = items.next();
      await expect(failure).rejects.toBeInstanceOf(ApiError);
      await expect(failure).rejects.toThrow(message);
      expect(connection.subscription.close).toHaveBeenCalledTimes(1);
      await expect(items.next()).rejects.toThrow(message);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    }
  );

  it('cannot be iterated again after a failure, so a retry around the same stream does not report an empty snapshot', async () => {
    connectDelivering([activeContractFrame('00a')], 1006);
    const snapshot = stream();

    await expect(readContractIds(snapshot)).rejects.toThrow(
      'Active-contracts stream closed before the snapshot completed [1006]'
    );
    await expect(readContractIds(snapshot)).rejects.toThrow(ONLY_ONCE);
    expect(() => snapshot[Symbol.asyncIterator]()).toThrow(ONLY_ONCE);
    expect(mockConnect).toHaveBeenCalledTimes(1);

    // A new stream reads the snapshot again.
    connectDelivering([activeContractFrame('00a'), activeContractFrame('00b')], 1000);
    await expect(readContractIds(stream())).resolves.toEqual(['00a', '00b']);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('cannot be iterated again after it completes', async () => {
    connectDelivering([activeContractFrame('00a')], 1000);
    const snapshot = stream();

    await expect(readContractIds(snapshot)).resolves.toEqual(['00a']);
    await expect(readContractIds(snapshot)).rejects.toThrow(ONLY_ONCE);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('rejects next() after return() closed the iterator before the snapshot completed', async () => {
    const { items, first, connection } = await startStream();
    void connection.handlers.onMessage(activeContractFrame('00a'));
    void connection.handlers.onMessage(activeContractFrame('00b'));
    await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });

    await expect(items.return?.()).resolves.toEqual({ done: true, value: undefined });
    expect(connection.subscription.close).toHaveBeenCalledTimes(1);
    await expect(items.next()).rejects.toThrow('Active-contracts stream was closed before the snapshot completed');
    await expect(items.next()).rejects.toThrow('Active-contracts stream was closed before the snapshot completed');
  });

  it('keeps reporting done after the snapshot completed, even once return() is called', async () => {
    const { items, first, connection } = await startStream();
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    await expect(first).resolves.toEqual({ done: true, value: undefined });

    await expect(items.return?.()).resolves.toEqual({ done: true, value: undefined });
    await expect(items.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('closes the socket and stops delivery when the consumer breaks out early', async () => {
    connectDelivering([activeContractFrame('00a'), activeContractFrame('00b')]);
    const snapshot = stream();

    const seen: JsGetActiveContractsResponseItem[] = [];
    for await (const item of snapshot) {
      seen.push(item);
      break;
    }

    const { handlers, subscription } = lastConnection();
    expect(seen).toEqual([activeContractItem('00a')]);
    expect(subscription.close).toHaveBeenCalledTimes(1);
    expect(() => {
      void handlers.onMessage(activeContractFrame('00c'));
    }).not.toThrow();
    // Iterating again would yield nothing and look like an empty snapshot, so it throws.
    await expect(readContractIds(snapshot)).rejects.toThrow(ONLY_ONCE);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('closes the socket when the consumer throws inside the loop', async () => {
    connectDelivering([activeContractFrame('00a'), activeContractFrame('00b')]);

    const consume = async (): Promise<void> => {
      for await (const item of stream()) {
        throw new Error(`consumer failed on ${JSON.stringify(item.workflowId)}`);
      }
    };

    await expect(consume()).rejects.toThrow('consumer failed');
    expect(lastConnection().subscription.close).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed connection without a socket to close', async () => {
    mockConnect.mockRejectedValueOnce(new Error('authentication failed'));

    const items = stream()[Symbol.asyncIterator]();
    await expect(items.next()).rejects.toThrow('authentication failed');
    await expect(items.next()).rejects.toThrow('authentication failed');
    expect(mockConnect).toHaveBeenCalledTimes(1);
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

  it('reports the offset passed in as the offset the snapshot is read at', async () => {
    const { snapshot, first, connection } = await startStream({ parties: [PARTY], activeAtOffset: 42 });
    expect(snapshot.activeAtOffset).toBe(42);
    void connection.handlers.onClose?.(1000, 'snapshot complete');
    await first;

    expect(snapshot.activeAtOffset).toBe(42);
  });

  it('defaults the offset to the ledger end, reports it, and defaults the parties to the client', async () => {
    const client = {
      getLedgerEnd: jest.fn().mockResolvedValue({ offset: 99 }),
      buildPartyList: () => ['Bob::fingerprint'],
    };
    const snapshot = new StreamActiveContracts(client as never).execute({});
    expect(snapshot.activeAtOffset).toBeUndefined();
    const items = snapshot[Symbol.asyncIterator]();
    expect(client.getLedgerEnd).not.toHaveBeenCalled();

    const first = items.next();
    await flush();
    // Known before the first item, so a reader can record where to continue the update stream from.
    expect(snapshot.activeAtOffset).toBe(99);
    void lastConnection().handlers.onMessage(activeContractFrame('00a'));
    void lastConnection().handlers.onClose?.(1000, 'snapshot complete');
    await expect(first).resolves.toEqual({ done: false, value: activeContractItem('00a') });
    await expect(items.next()).resolves.toEqual({ done: true, value: undefined });

    expect(snapshot.activeAtOffset).toBe(99);
    expect(client.getLedgerEnd).toHaveBeenCalledTimes(1);
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

  it.each([
    [1006, '', 'Active-contracts stream closed before the snapshot completed [1006]'],
    [1001, 'going away', 'Active-contracts stream closed before the snapshot completed [1001]: going away'],
  ])(
    'rejects instead of resolving with part of the snapshot on a close with code %i',
    async (code, reason, message) => {
      mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers) => {
        await handlers.onMessage(activeContractFrame('00a'));
        await handlers.onClose?.(code, reason);
        return { close: jest.fn(), isConnected: () => false, getConnectionState: () => 3 };
      });
      const onItem = jest.fn();

      const result = new GetActiveContracts({} as never).execute({ parties: [PARTY], activeAtOffset: 42, onItem });
      await expect(result).rejects.toBeInstanceOf(ApiError);
      await expect(result).rejects.toThrow(message);
      expect(onItem).toHaveBeenCalledTimes(1);
    }
  );

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
