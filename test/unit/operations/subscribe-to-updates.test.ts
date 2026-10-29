import {
  getUpdateOffset,
  SubscribeToUpdates,
  TransactionShape,
  UpdatesStreamClosedError,
  UpdatesWsMessageSchema,
  type UpdatesStreamCloseInfo,
  type UpdatesWsMessage,
} from '../../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-updates';
import type { WebSocketOptions } from '../../../src/core/ws/WebSocketClient';
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
const ASSET_INTERFACE = '#example-package:Example.Module:Asset';
const REGISTRY_INTERFACE = '#example-package:Example.Module:Registry';

/** Representative `/v2/updates` Transaction frame (AsyncAPI value-wrapped JsTransaction). */
export function createWireTransactionUpdateMessage(overrides?: {
  offset?: number;
  includeExercised?: boolean;
  /** When true, mirror Splice wire: optional Scala `Option` fields as explicit JSON null. */
  nullOptionalFields?: boolean;
  /** Interface views carried by the CreatedEvent (wire shape). */
  interfaceViews?: Array<Record<string, unknown>>;
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
        ...(overrides?.interfaceViews !== undefined ? { interfaceViews: overrides.interfaceViews } : {}),
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
            ? { traceContext: null, externalTransactionHash: null, paidTrafficCost: null }
            : {
                traceContext: {
                  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
                },
                paidTrafficCost: 0,
              }),
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
  overrides?: { nullOptionalFields?: boolean }
): Record<string, unknown> {
  const nullOptional = overrides?.nullOptionalFields === true;
  return {
    update: {
      Reassignment: {
        value: {
          updateId: '1220reassignmenthash',
          offset,
          recordTime: '2026-08-10T12:00:00.123456Z',
          synchronizerId: SYNCHRONIZER_ID,
          ...(nullOptional ? { traceContext: null, paidTrafficCost: null } : { paidTrafficCost: 0 }),
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

/** Representative TopologyTransaction with ParticipantAuthorizationOnboarding. */
export function createWireTopologyOnboardingUpdateMessage(offset = 6_619_790): Record<string, unknown> {
  return {
    update: {
      TopologyTransaction: {
        value: {
          updateId: '1220topologyhash',
          offset,
          recordTime: '2026-08-10T12:00:00.123456Z',
          synchronizerId: SYNCHRONIZER_ID,
          events: [
            {
              event: {
                ParticipantAuthorizationOnboarding: {
                  value: {
                    partyId: PARTY,
                    participantId: 'participant::fingerprint',
                    participantPermission: 'PARTICIPANT_PERMISSION_SUBMISSION',
                  },
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
              paidTrafficCost?: unknown;
              events: Array<{ CreatedEvent?: { contractKey?: unknown }; ExercisedEvent?: { interfaceId?: unknown } }>;
            };
          };
        };
      }
    ).update.Transaction.value;
    expect(transaction.traceContext).toBeUndefined();
    expect(transaction.externalTransactionHash).toBeUndefined();
    expect(transaction.paidTrafficCost).toBeUndefined();
    expect(transaction.events[0]?.CreatedEvent?.contractKey).toBeUndefined();
    expect(transaction.events[1]?.ExercisedEvent?.interfaceId).toBeUndefined();
    // Wire sent explicit nulls; parsed output must not re-expose null for these optionals.
    expect(transaction).not.toHaveProperty('traceContext', null);
    expect(transaction).not.toHaveProperty('paidTrafficCost', null);
    expect(transaction.events[0]?.CreatedEvent).not.toHaveProperty('contractKey', null);
  });

  it('normalizes present paidTrafficCost number wire to digit string', (): void => {
    const result = UpdatesWsMessageSchema.safeParse(createWireTransactionUpdateMessage());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const { paidTrafficCost } = (result.data as { update: { Transaction: { value: { paidTrafficCost?: unknown } } } })
      .update.Transaction.value;
    expect(paidTrafficCost).toBe('0');
  });

  it('accepts OffsetCheckpoint frames', (): void => {
    expect(UpdatesWsMessageSchema.safeParse(createWireOffsetCheckpointMessage()).success).toBe(true);
  });

  it('accepts value-wrapped Reassignment frames', (): void => {
    expect(UpdatesWsMessageSchema.safeParse(createWireReassignmentUpdateMessage()).success).toBe(true);
  });

  it('accepts value-wrapped Reassignment frames with null optionals normalized to undefined', (): void => {
    const result = UpdatesWsMessageSchema.safeParse(
      createWireReassignmentUpdateMessage(6_619_780, { nullOptionalFields: true })
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const reassignment = (
      result.data as {
        update: { Reassignment: { value: { traceContext?: unknown; paidTrafficCost?: unknown } } };
      }
    ).update.Reassignment.value;
    expect(reassignment.traceContext).toBeUndefined();
    expect(reassignment.paidTrafficCost).toBeUndefined();
  });

  it('accepts TopologyTransaction with ParticipantAuthorizationOnboarding', (): void => {
    const result = UpdatesWsMessageSchema.safeParse(createWireTopologyOnboardingUpdateMessage());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const topology = (
      result.data as {
        update: {
          TopologyTransaction: {
            value: {
              events: Array<{
                event?: { ParticipantAuthorizationOnboarding?: { value: { partyId: string } } };
              }>;
            };
          };
        };
      }
    ).update.TopologyTransaction.value;
    expect(topology.events[0]?.event?.ParticipantAuthorizationOnboarding?.value.partyId).toBe(PARTY);
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
    const wireMessage = {
      ...createWireTransactionUpdateMessage({ offset: 6_619_776, nullOptionalFields: true }),
      topLevelExtension: 'preserve-me',
    };
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
      topLevelExtension?: unknown;
      update: {
        Transaction: {
          value: {
            traceContext?: unknown;
            externalTransactionHash?: unknown;
            paidTrafficCost?: unknown;
            events: Array<{
              CreatedEvent?: { representativePackageId?: string; acsDelta?: boolean; contractKey?: unknown };
            }>;
          };
        };
      };
    };
    // Normalized Zod output (not the raw wire object): null optionals → undefined.
    expect(delivered).not.toBe(wireMessage);
    expect(delivered.topLevelExtension).toBe('preserve-me');
    const { value } = delivered.update.Transaction;
    expect(value.traceContext).toBeUndefined();
    expect(value.externalTransactionHash).toBeUndefined();
    expect(value.paidTrafficCost).toBeUndefined();
    const created = value.events[0]?.CreatedEvent;
    expect(created?.representativePackageId).toBe(PACKAGE_ID);
    expect(created?.acsDelta).toBe(true);
    expect(created?.contractKey).toBeUndefined();
  });
});

describe('SubscribeToUpdates request', (): void => {
  const client = {
    buildPartyList: (): string[] => ['Default'],
    getLedgerEnd: jest.fn().mockResolvedValue({ offset: 1 }),
  };

  interface Handlers {
    onMessage: (message: unknown) => Promise<void>;
    onClose?: (code: number, reason: string) => void;
  }

  /** Resolves the connection immediately; frames are delivered before the stream closes. */
  function mockStream(frames: unknown[] = []): void {
    mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers): Promise<unknown> => {
      for (const frame of frames) {
        await handlers.onMessage(frame);
      }
      handlers.onClose?.(1000, 'stream complete');
      return { close: jest.fn(), isConnected: (): boolean => false, getConnectionState: (): number => 3 };
    });
  }

  function sentRequest(): unknown {
    expect(mockConnect).toHaveBeenCalledTimes(1);
    const [path, request] = mockConnect.mock.calls[0] as [string, unknown];
    expect(path).toBe('/v2/updates');
    return request;
  }

  function interfaceFilter(
    interfaceId: string,
    flags: { includeInterfaceView: boolean; includeCreatedEventBlob: boolean }
  ): Record<string, unknown> {
    return { identifierFilter: { InterfaceFilter: { value: { interfaceId, ...flags } } } };
  }

  beforeEach((): void => {
    mockConnect.mockReset();
  });

  it('keeps the template-only request unchanged', async (): Promise<void> => {
    mockStream();

    await new SubscribeToUpdates(client as never).connect({
      parties: ['Alice'],
      beginExclusive: 42,
      templateIds: ['#splice-amulet:Splice.Amulet:Amulet'],
    });

    const templateFilters = {
      Alice: {
        cumulative: [
          {
            identifierFilter: {
              TemplateFilter: {
                value: { templateId: '#splice-amulet:Splice.Amulet:Amulet', includeCreatedEventBlob: false },
              },
            },
          },
        ],
      },
    };
    expect(sentRequest()).toEqual({
      beginExclusive: 42,
      verbose: false,
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: false, filtersByParty: templateFilters },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
        includeReassignments: { filtersByParty: templateFilters, verbose: false },
      },
    });
  });

  it('keeps the unfiltered request unchanged, including topology events on the default party list', async (): Promise<void> => {
    mockStream();

    await new SubscribeToUpdates(client as never).connect({
      beginExclusive: 7,
      endInclusive: 9,
      includeReassignments: false,
      includeTopologyEvents: true,
    });

    expect(sentRequest()).toEqual({
      beginExclusive: 7,
      endInclusive: 9,
      verbose: false,
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: false, filtersByParty: { Default: { cumulative: [] } } },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
        includeTopologyEvents: { includeParticipantAuthorizationEvents: { parties: ['Default'] } },
      },
    });
  });

  it('puts interface filters into the transaction and reassignment formats', async (): Promise<void> => {
    mockStream();

    await new SubscribeToUpdates(client as never).connect({
      parties: ['Alice'],
      beginExclusive: 42,
      interfaceIds: [ASSET_INTERFACE, REGISTRY_INTERFACE],
      includeCreatedEventBlob: true,
    });

    const flags = { includeInterfaceView: true, includeCreatedEventBlob: true };
    const cumulative = [interfaceFilter(ASSET_INTERFACE, flags), interfaceFilter(REGISTRY_INTERFACE, flags)];
    expect(sentRequest()).toEqual({
      beginExclusive: 42,
      verbose: false,
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: false, filtersByParty: { Alice: { cumulative } } },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
        includeReassignments: { filtersByParty: { Alice: { cumulative } }, verbose: false },
      },
    });
  });

  it('forwards includeInterfaceView and the transaction shape', async (): Promise<void> => {
    mockStream();

    await new SubscribeToUpdates(client as never).connect({
      parties: ['Alice'],
      beginExclusive: 42,
      interfaceIds: [ASSET_INTERFACE],
      includeInterfaceView: false,
      transactionShape: TransactionShape.TRANSACTION_SHAPE_ACS_DELTA,
    });

    const cumulative = [
      interfaceFilter(ASSET_INTERFACE, { includeInterfaceView: false, includeCreatedEventBlob: false }),
    ];
    expect(sentRequest()).toEqual({
      beginExclusive: 42,
      verbose: false,
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: false, filtersByParty: { Alice: { cumulative } } },
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        },
        includeReassignments: { filtersByParty: { Alice: { cumulative } }, verbose: false },
      },
    });
  });

  it('delivers successful and failed interface views to onMessage normalized', async (): Promise<void> => {
    const frame = createWireTransactionUpdateMessage({
      includeExercised: false,
      interfaceViews: [
        {
          interfaceId: ASSET_INTERFACE,
          implementationPackageId: PACKAGE_ID,
          viewStatus: { code: 0, message: '', details: [] },
          viewValue: { cap_table_id: 'cap-table-1', object_type: 'STAKEHOLDER', object_id: 's-1', security_ids: [] },
        },
        {
          interfaceId: REGISTRY_INTERFACE,
          implementationPackageId: null,
          viewStatus: { code: 9, message: 'view failed', details: [] },
          viewValue: null,
        },
      ],
    });
    mockStream([frame]);
    const onMessage = jest.fn().mockResolvedValue(undefined);

    await new SubscribeToUpdates(client as never).connect({
      parties: ['Alice'],
      beginExclusive: 42,
      interfaceIds: [ASSET_INTERFACE, REGISTRY_INTERFACE],
      onMessage,
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    const delivered = onMessage.mock.calls[0]?.[0] as {
      update: { Transaction: { value: { events: Array<{ CreatedEvent?: { interfaceViews: unknown[] } }> } } };
    };
    const views = delivered.update.Transaction.value.events[0]?.CreatedEvent?.interfaceViews;
    expect(views).toStrictEqual([
      {
        interfaceId: ASSET_INTERFACE,
        implementationPackageId: PACKAGE_ID,
        viewStatus: { code: 0, message: '', details: [] },
        viewValue: { cap_table_id: 'cap-table-1', object_type: 'STAKEHOLDER', object_id: 's-1', security_ids: [] },
      },
      {
        interfaceId: REGISTRY_INTERFACE,
        viewStatus: { code: 9, message: 'view failed', details: [] },
      },
    ]);
  });
});

describe('SubscribeToUpdates any party', (): void => {
  beforeEach((): void => {
    mockConnect.mockReset();
    mockConnect.mockImplementation(
      async (_path: string, _request: unknown, handlers: { onClose?: (code: number, reason: string) => void }) => {
        handlers.onClose?.(1000, 'stream complete');
        return { close: jest.fn(), isConnected: (): boolean => false, getConnectionState: (): number => 3 };
      }
    );
  });

  it('sends filtersForAnyParty without falling back to the client party list', async (): Promise<void> => {
    const buildPartyList = jest.fn((): string[] => ['Default']);
    const client = { buildPartyList, getLedgerEnd: jest.fn() };

    await new SubscribeToUpdates(client as never).connect({
      anyParty: true,
      beginExclusive: 100,
      endInclusive: 200,
      includeCreatedEventBlob: true,
      includeReassignments: false,
    });

    expect(buildPartyList).not.toHaveBeenCalled();
    expect(mockConnect.mock.calls[0]?.[1]).toStrictEqual({
      beginExclusive: 100,
      endInclusive: 200,
      verbose: false,
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: false,
            filtersByParty: {},
            filtersForAnyParty: {
              cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
            },
          },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
  });

  it('adds only the caller-listed parties, and reassignments read as any party too', async (): Promise<void> => {
    const buildPartyList = jest.fn((): string[] => ['Default']);
    const client = { buildPartyList, getLedgerEnd: jest.fn() };

    await new SubscribeToUpdates(client as never).connect({ anyParty: true, parties: ['Alice'], beginExclusive: 1 });

    expect(buildPartyList).not.toHaveBeenCalled();
    const request = mockConnect.mock.calls[0]?.[1] as {
      updateFormat: { includeTransactions: { eventFormat: unknown }; includeReassignments: unknown };
    };
    const anyPartyFilter = {
      cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }],
    };
    expect(request.updateFormat.includeTransactions.eventFormat).toStrictEqual({
      verbose: false,
      filtersByParty: { Alice: { cumulative: [] } },
      filtersForAnyParty: anyPartyFilter,
    });
    expect(request.updateFormat.includeReassignments).toStrictEqual({
      filtersByParty: { Alice: { cumulative: [] } },
      filtersForAnyParty: anyPartyFilter,
      verbose: false,
    });
  });
});

describe('getUpdateOffset', (): void => {
  it('reads the offset of every update kind, checkpoints included', (): void => {
    const decode = (frame: unknown): UpdatesWsMessage => UpdatesWsMessageSchema.parse(frame);
    expect(getUpdateOffset(decode(createWireTransactionUpdateMessage({ offset: 11 })))).toBe(11);
    expect(getUpdateOffset(decode(createWireReassignmentUpdateMessage(12)))).toBe(12);
    expect(getUpdateOffset(decode(createWireTopologyOnboardingUpdateMessage(13)))).toBe(13);
    expect(getUpdateOffset(decode(createWireOffsetCheckpointMessage(14)))).toBe(14);
    expect(getUpdateOffset(decode({ code: 'INTERNAL', cause: 'boom', errorCategory: 1 }))).toBeUndefined();
  });
});

describe('SubscribeToUpdates close semantics', (): void => {
  const client = { buildPartyList: (): string[] => ['Alice'], getLedgerEnd: jest.fn() };

  interface Handlers {
    onMessage: (message: unknown) => Promise<void>;
    onClose?: (code: number, reason: string) => void;
  }

  /** Delivers the frames, optionally runs the token refresh, then closes with the given code. */
  function mockStream(frames: unknown[], close: { code: number; reason: string; tokenRefresh?: boolean }): void {
    mockConnect.mockImplementation(
      async (_path: string, _request: unknown, handlers: Handlers, options?: WebSocketOptions): Promise<unknown> => {
        for (const frame of frames) {
          await handlers.onMessage(frame);
        }
        if (close.tokenRefresh === true) {
          await options?.onTokenRefreshNeeded?.();
        }
        handlers.onClose?.(close.code, close.reason);
        return { close: jest.fn(), isConnected: (): boolean => false, getConnectionState: (): number => 3 };
      }
    );
  }

  const frames = [createWireTransactionUpdateMessage({ offset: 10 }), createWireOffsetCheckpointMessage(15)];

  beforeEach((): void => {
    mockConnect.mockReset();
  });

  it('resolves on an abnormal close by default but reports it through onClose', async (): Promise<void> => {
    mockStream(frames, { code: 1006, reason: '' });
    const infos: UpdatesStreamCloseInfo[] = [];

    await new SubscribeToUpdates(client as never).connect({
      beginExclusive: 1,
      endInclusive: 100,
      onClose: (info) => {
        infos.push(info);
      },
    });

    expect(infos).toStrictEqual([{ code: 1006, reason: '', initiatedBy: 'peer', complete: false, lastOffset: 15 }]);
  });

  it('resolves a peer close with 1000 when rejectOnAbnormalClose is set', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });
    const onClose = jest.fn();

    await expect(
      new SubscribeToUpdates(client as never).connect({
        beginExclusive: 1,
        endInclusive: 100,
        rejectOnAbnormalClose: true,
        onClose,
      })
    ).resolves.toBeUndefined();
    expect(onClose).toHaveBeenCalledWith({
      code: 1000,
      reason: 'stream complete',
      initiatedBy: 'peer',
      complete: true,
      lastOffset: 15,
    });
  });

  it('rejects a peer close with 1000 of an unbounded stream, which never completes', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });
    const onClose = jest.fn();

    const error: unknown = await new SubscribeToUpdates(client as never)
      .connect({ beginExclusive: 1, rejectOnAbnormalClose: true, onClose })
      .then(
        () => undefined,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(UpdatesStreamClosedError);
    expect(error).toMatchObject({ closeCode: 1000, initiatedBy: 'peer', lastOffset: 15 });
    expect(onClose).toHaveBeenCalledWith({
      code: 1000,
      reason: 'stream complete',
      initiatedBy: 'peer',
      complete: false,
      lastOffset: 15,
    });
  });

  it('still resolves a peer close with 1000 of an unbounded stream by default, reported as incomplete', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });
    const onClose = jest.fn();

    await expect(
      new SubscribeToUpdates(client as never).connect({ beginExclusive: 1, onClose })
    ).resolves.toBeUndefined();
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 1000, complete: false }));
  });

  it('rejects a network close with a retryable error carrying the last offset', async (): Promise<void> => {
    mockStream(frames, { code: 1006, reason: '' });

    const error: unknown = await new SubscribeToUpdates(client as never)
      .connect({ beginExclusive: 1, endInclusive: 100, rejectOnAbnormalClose: true })
      .then(
        () => undefined,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(UpdatesStreamClosedError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      retryable: true,
      closeCode: 1006,
      closeReason: '',
      initiatedBy: 'peer',
      lastOffset: 15,
    });
  });

  it('rejects a token-refresh close even when it uses code 1000', async (): Promise<void> => {
    mockStream(frames.slice(0, 1), { code: 1000, reason: 'refresh', tokenRefresh: true });
    const onTokenRefreshNeeded = jest.fn(() => ({ code: 1000, reason: 'refresh' }));

    const error: unknown = await new SubscribeToUpdates(client as never)
      .connect({ beginExclusive: 1, endInclusive: 100, rejectOnAbnormalClose: true, onTokenRefreshNeeded })
      .then(
        () => undefined,
        (err: unknown) => err
      );

    expect(onTokenRefreshNeeded).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(UpdatesStreamClosedError);
    expect(error).toMatchObject({ closeCode: 1000, initiatedBy: 'token-refresh', lastOffset: 10 });
  });

  it('reports no offset when the stream closes before any frame', async (): Promise<void> => {
    mockStream([], { code: 4000, reason: 'Token refresh required' });

    await expect(
      new SubscribeToUpdates(client as never).connect({ beginExclusive: 1, rejectOnAbnormalClose: true })
    ).rejects.toMatchObject({ closeCode: 4000, initiatedBy: 'peer', lastOffset: undefined });
  });

  it('rejects with the error an onClose callback throws', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });

    await expect(
      new SubscribeToUpdates(client as never).connect({
        beginExclusive: 1,
        onClose: () => {
          throw new Error('cursor write failed');
        },
      })
    ).rejects.toThrow('cursor write failed');
  });

  it('rejects with the error an async onClose callback rejects with', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });

    await expect(
      new SubscribeToUpdates(client as never).connect({
        beginExclusive: 1,
        endInclusive: 100,
        onClose: async (): Promise<void> => {
          await Promise.resolve();
          throw new Error('async cursor write failed');
        },
      })
    ).rejects.toThrow('async cursor write failed');
  });

  it('waits for an async onClose callback before it resolves', async (): Promise<void> => {
    mockStream(frames, { code: 1000, reason: 'stream complete' });
    const events: string[] = [];

    await new SubscribeToUpdates(client as never).connect({
      beginExclusive: 1,
      endInclusive: 100,
      onClose: async (): Promise<void> => {
        await new Promise((resolve) => setImmediate(resolve));
        events.push('onClose finished');
      },
    });
    events.push('subscription resolved');

    expect(events).toStrictEqual(['onClose finished', 'subscription resolved']);
  });

  it('waits for an async onClose callback before it rejects with the close error', async (): Promise<void> => {
    mockStream(frames, { code: 1006, reason: '' });
    const events: string[] = [];

    const error: unknown = await new SubscribeToUpdates(client as never)
      .connect({
        beginExclusive: 1,
        endInclusive: 100,
        rejectOnAbnormalClose: true,
        onClose: async (): Promise<void> => {
          await new Promise((resolve) => setImmediate(resolve));
          events.push('onClose finished');
        },
      })
      .then(
        () => undefined,
        (err: unknown) => err
      );
    events.push('subscription rejected');

    expect(error).toBeInstanceOf(UpdatesStreamClosedError);
    expect(events).toStrictEqual(['onClose finished', 'subscription rejected']);
  });
});
