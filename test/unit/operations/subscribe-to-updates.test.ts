import {
  SubscribeToUpdates,
  UpdatesWsMessageSchema,
} from '../../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-updates';
import { WsUpdateSchema } from '../../../src/clients/ledger-json-api/schemas/api/updates';
import { ApiError } from '../../../src/core/errors';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

const PACKAGE_ID = '12'.repeat(32);
const CONTRACT_ID = `00${'ab'.repeat(32)}`;
const PARTY = 'Alice::fingerprint';
const SYNCHRONIZER_ID = 'global-domain::fingerprint';

/** Representative `/v2/updates` Transaction frame (AsyncAPI value-wrapped JsTransaction). */
export function createWireTransactionUpdateMessage(overrides?: {
  offset?: number;
  includeExercised?: boolean;
  /** When true, mirror Splice wire: `traceContext`/`externalTransactionHash`/`contractKey` as null. */
  nullOptionalFields?: boolean;
}): Record<string, unknown> {
  const offset = overrides?.offset ?? 6_619_776;
  const nullOptional = overrides?.nullOptionalFields === true;
  const events: Array<Record<string, unknown>> = [
    {
      CreatedEvent: {
        offset,
        nodeId: 0,
        contractId: CONTRACT_ID,
        templateId: `${PACKAGE_ID}:Splice.Amulet:AppRewardCoupon`,
        ...(nullOptional ? { contractKey: null } : {}),
        createArgument: { dso: 'DSO', provider: PARTY, amount: '1.0' },
        createdEventBlob: Buffer.from('blob').toString('base64'),
        witnessParties: [PARTY],
        signatories: [PARTY],
        observers: [],
        createdAt: '2026-08-10T12:00:00.123456Z',
        packageName: 'splice-amulet',
        representativePackageId: PACKAGE_ID,
        acsDelta: true,
      },
    },
  ];

  if (overrides?.includeExercised !== false) {
    events.push({
      ExercisedEvent: {
        offset,
        nodeId: 1,
        contractId: CONTRACT_ID,
        templateId: `${PACKAGE_ID}:Splice.Amulet:AppRewardCoupon`,
        ...(nullOptional ? { interfaceId: null } : {}),
        choice: 'Expire',
        choiceArgument: {},
        actingParties: [PARTY],
        consuming: true,
        witnessParties: [PARTY],
        lastDescendantNodeId: 1,
        exerciseResult: {},
        packageName: 'splice-amulet',
        acsDelta: true,
      },
    });
  }

  return {
    update: {
      Transaction: {
        value: {
          updateId: '1220transactionhash',
          commandId: 'cmd-1',
          workflowId: '',
          effectiveAt: '2026-08-10T12:00:00.123456Z',
          offset,
          synchronizerId: SYNCHRONIZER_ID,
          recordTime: '2026-08-10T12:00:00.123456Z',
          events,
          ...(nullOptional
            ? { traceContext: null, externalTransactionHash: null }
            : {
                traceContext: {
                  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
                },
              }),
          paidTrafficCost: 0,
        },
      },
    },
  };
}

/** Representative OffsetCheckpoint frame. */
export function createWireOffsetCheckpointMessage(offset = 6_619_775): Record<string, unknown> {
  return {
    update: {
      OffsetCheckpoint: {
        value: {
          offset,
          synchronizerTimes: [{ synchronizerId: SYNCHRONIZER_ID, recordTime: '2026-08-10T12:00:00.123456Z' }],
        },
      },
    },
  };
}

/** Representative Reassignment frame (value-wrapped). */
export function createWireReassignmentUpdateMessage(
  offset = 6_619_780,
  overrides?: { nullTraceContext?: boolean }
): Record<string, unknown> {
  return {
    update: {
      Reassignment: {
        value: {
          updateId: '1220reassignmenthash',
          offset,
          recordTime: '2026-08-10T12:00:00.123456Z',
          synchronizerId: SYNCHRONIZER_ID,
          ...(overrides?.nullTraceContext ? { traceContext: null } : {}),
          events: [
            {
              JsUnassignedEvent: {
                value: {
                  offset,
                  nodeId: 0,
                  contractId: CONTRACT_ID,
                  templateId: `${PACKAGE_ID}:Splice.Amulet:Amulet`,
                  source: SYNCHRONIZER_ID,
                  target: 'other-domain::fingerprint',
                  reassignmentId: 'reassignment-1',
                  submitter: PARTY,
                  reassignmentCounter: 1,
                  packageName: 'splice-amulet',
                },
              },
            },
          ],
        },
      },
    },
  };
}

describe('WsUpdateSchema / UpdatesWsMessageSchema wire fixtures', (): void => {
  it('accepts value-wrapped Transaction frames with CreatedEvent and ExercisedEvent', (): void => {
    const message = createWireTransactionUpdateMessage();
    const result = UpdatesWsMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
    expect(WsUpdateSchema.safeParse(message['update']).success).toBe(true);
  });

  it('accepts Splice-style null optional fields and normalizes them to undefined', (): void => {
    const message = createWireTransactionUpdateMessage({ nullOptionalFields: true });
    const result = UpdatesWsMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const transaction = (
      result.data as {
        update: {
          Transaction: {
            value: {
              traceContext?: unknown;
              externalTransactionHash?: unknown;
              events: Array<{ CreatedEvent?: { contractKey?: unknown }; ExercisedEvent?: { interfaceId?: unknown } }>;
            };
          };
        };
      }
    ).update.Transaction.value;
    expect(transaction.traceContext).toBeUndefined();
    expect(transaction.externalTransactionHash).toBeUndefined();
    expect(transaction.events[0]?.CreatedEvent?.contractKey).toBeUndefined();
    expect(transaction.events[1]?.ExercisedEvent?.interfaceId).toBeUndefined();
    // Wire sent explicit nulls; parsed output must not re-expose null for these optionals.
    expect(transaction).not.toHaveProperty('traceContext', null);
    expect(transaction.events[0]?.CreatedEvent).not.toHaveProperty('contractKey', null);
  });

  it('accepts OffsetCheckpoint frames', (): void => {
    expect(UpdatesWsMessageSchema.safeParse(createWireOffsetCheckpointMessage()).success).toBe(true);
  });

  it('accepts value-wrapped Reassignment frames', (): void => {
    expect(UpdatesWsMessageSchema.safeParse(createWireReassignmentUpdateMessage()).success).toBe(true);
  });

  it('accepts value-wrapped Reassignment frames with null traceContext normalized to undefined', (): void => {
    const result = UpdatesWsMessageSchema.safeParse(
      createWireReassignmentUpdateMessage(6_619_780, { nullTraceContext: true })
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const reassignment = (
      result.data as { update: { Reassignment: { value: { traceContext?: unknown } } } }
    ).update.Reassignment.value;
    expect(reassignment.traceContext).toBeUndefined();
  });

  it('rejects the pre-#379 mistaken flat Transaction shape (no value wrapper)', (): void => {
    const flat = {
      update: {
        Transaction: {
          updateId: '1220transactionhash',
          effectiveAt: '2026-08-10T12:00:00.123456Z',
          offset: 1,
          synchronizerId: SYNCHRONIZER_ID,
          recordTime: '2026-08-10T12:00:00.123456Z',
          events: [],
        },
      },
    };
    const result = UpdatesWsMessageSchema.safeParse(flat);
    expect(result.success).toBe(false);
  });

  it('rejects REST JsTransaction-named wrappers on the WebSocket union', (): void => {
    const restShaped = {
      update: {
        JsTransaction: {
          updateId: '1220transactionhash',
          effectiveAt: '2026-08-10T12:00:00.123456Z',
          offset: 1,
          synchronizerId: SYNCHRONIZER_ID,
          recordTime: '2026-08-10T12:00:00.123456Z',
          events: [],
        },
      },
    };
    expect(UpdatesWsMessageSchema.safeParse(restShaped).success).toBe(false);
  });

  it('rejects the mistaken JsCreated event kind shape used before the wire fix', (): void => {
    const legacyKind = {
      update: {
        Transaction: {
          value: {
            updateId: '1220transactionhash',
            effectiveAt: '2026-08-10T12:00:00.123456Z',
            offset: 1,
            synchronizerId: SYNCHRONIZER_ID,
            recordTime: '2026-08-10T12:00:00.123456Z',
            events: [
              {
                kind: {
                  JsCreated: {
                    offset: 1,
                    nodeId: 0,
                    contractId: CONTRACT_ID,
                    templateId: `${PACKAGE_ID}:Mod:T`,
                    contractKey: null,
                    createArgument: {},
                    createdEventBlob: '',
                    witnessParties: [PARTY],
                    signatories: [PARTY],
                    observers: [],
                    createdAt: '2026-08-10T12:00:00.123456Z',
                    packageName: 'pkg',
                  },
                },
                synchronizerId: SYNCHRONIZER_ID,
                reassignmentCounter: 0,
              },
            ],
          },
        },
      },
    };
    expect(UpdatesWsMessageSchema.safeParse(legacyKind).success).toBe(false);
  });
});

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

  it('rejects a null frame with Zod issue details in the ApiError', async (): Promise<void> => {
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

    try {
      await new SubscribeToUpdates(client as never).connect({ beginExclusive: 42, onMessage });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Error).message).toMatch(/^Unexpected ledger updates WebSocket message:/);
      expect((error as ApiError).context).toEqual(
        expect.objectContaining({
          zodIssues: expect.any(Array),
        })
      );
      expect(((error as ApiError).context as { zodIssues: unknown[] }).zodIssues.length).toBeGreaterThan(0);
    }
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('delivers normalized Transaction frames to onMessage without stripping known wire fields', async (): Promise<void> => {
    const wireMessage = createWireTransactionUpdateMessage({ offset: 6_619_776, nullOptionalFields: true });
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
        await handlers.onMessage(wireMessage);
        handlers.onClose?.(1000, 'stream complete');
        return {
          close: jest.fn(),
          isConnected: (): boolean => false,
          getConnectionState: (): number => 3,
        };
      }
    );
    const client = {
      buildPartyList: (): string[] => [PARTY],
      getLedgerEnd: jest.fn().mockResolvedValue({ offset: 42 }),
    };

    await new SubscribeToUpdates(client as never).connect({ beginExclusive: 42, onMessage });

    expect(onMessage).toHaveBeenCalledTimes(1);
    const delivered = onMessage.mock.calls[0]?.[0] as {
      update: {
        Transaction: {
          value: {
            traceContext?: unknown;
            externalTransactionHash?: unknown;
            events: Array<{
              CreatedEvent?: { representativePackageId?: string; acsDelta?: boolean; contractKey?: unknown };
            }>;
          };
        };
      };
    };
    // Normalized Zod output (not the raw wire object): null optionals → undefined.
    expect(delivered).not.toBe(wireMessage);
    const value = delivered.update.Transaction.value;
    expect(value.traceContext).toBeUndefined();
    expect(value.externalTransactionHash).toBeUndefined();
    const created = value.events[0]?.CreatedEvent;
    expect(created?.representativePackageId).toBe(PACKAGE_ID);
    expect(created?.acsDelta).toBe(true);
    expect(created?.contractKey).toBeUndefined();
  });
});
