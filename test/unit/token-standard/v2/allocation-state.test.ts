import type { JsGetActiveContractsResponseItem } from '../../../../src/clients/ledger-json-api/schemas';
import {
  buildTokenStandardV2AllocationChoiceArgument,
  discoverTokenStandardV2AllocationState,
  getTokenStandardV2AllocationViewsByContractIds,
  TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID,
  TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID,
  TokenStandardV2AllocationStateError,
  TokenStandardV2AllocationStateErrorCode,
  type BuildTokenStandardV2AllocationChoiceArgumentParams,
  type TokenStandardV2AllocationInstructionView,
  type TokenStandardV2AllocationStateClient,
  type TokenStandardV2AllocationStateRequest,
  type TokenStandardV2AllocationView,
} from '../../../../src/utils/token-standard';

const synchronizerId = 'global-domain::1220primary';

const allocationParams: BuildTokenStandardV2AllocationChoiceArgumentParams = {
  settlement: {
    executors: ['Venue::operator', 'SettlementAgent::agent'],
    id: 'settlement-3',
    cid: '#settlement-context',
    meta: { values: { venue: 'example', trade: 'trade-3' } },
  },
  allocation: {
    admin: 'CashAdmin::issuer',
    authorizer: {
      owner: 'Buyer::alice',
      provider: 'Custodian::provider',
      id: 'cash-account',
    },
    transferLegSides: [
      {
        transferLegId: 'cash-leg',
        side: 'SenderSide',
        otherside: {
          owner: 'Seller::bob',
          provider: null,
          id: '',
        },
        amount: '25.0',
        instrumentId: 'USD',
        meta: { values: { purpose: 'principal' } },
      },
      {
        transferLegId: 'fee-leg',
        side: 'ReceiverSide',
        otherside: {
          owner: 'Venue::operator',
          provider: null,
          id: 'fees',
        },
        amount: '1.2500',
        instrumentId: 'USD',
        meta: { values: {} },
      },
    ],
    settlementDeadline: '2026-07-10T02:00:00.000Z',
    nextIterationFunding: { USD: '1.0', EUR: '10.00' },
    committed: true,
    meta: { values: { iteration: 'enabled' } },
  },
  requestedAt: '2026-07-10T01:00:00.000Z',
  inputHoldingCids: ['#cash-holding-1', '#cash-holding-2'],
  actors: ['Buyer::alice'],
};

const choiceArgument = buildTokenStandardV2AllocationChoiceArgument(allocationParams);
const request: TokenStandardV2AllocationStateRequest = choiceArgument;

function requireFixtureValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing ${name} test fixture`);
  return value;
}

const cashLeg = requireFixtureValue(choiceArgument.allocation.transferLegSides[0], 'cash leg');
const feeLeg = requireFixtureValue(choiceArgument.allocation.transferLegSides[1], 'fee leg');

const matchingSettlement: TokenStandardV2AllocationView['settlement'] = {
  ...choiceArgument.settlement,
  meta: { values: { trade: 'trade-3', venue: 'example' } },
};

const matchingAllocation: TokenStandardV2AllocationView['allocation'] = {
  ...choiceArgument.allocation,
  transferLegSides: [
    {
      ...cashLeg,
      amount: '25.0000000000',
    },
    {
      ...feeLeg,
      amount: '1.25',
    },
  ],
  settlementDeadline: '2026-07-10T02:00:00Z',
  nextIterationFunding: { EUR: '10.0000000000', USD: '1.0000000000' },
};

const completedView: TokenStandardV2AllocationView = {
  originalAllocationCid: null,
  settlement: matchingSettlement,
  allocation: matchingAllocation,
  holdingCids: ['#locked-holding'],
  createdAt: '2026-07-10T01:00:01Z',
  numIterations: '0',
  expiresAt: '2026-07-10T02:00:00Z',
  availableActions: [['AA_Settle', [['Venue::operator']]]],
  meta: { values: { registry: 'cash' } },
};

const pendingView: TokenStandardV2AllocationInstructionView = {
  originalInstructionCid: null,
  settlement: matchingSettlement,
  allocation: matchingAllocation,
  requestedAt: '2026-07-10T01:00:00Z',
  inputHoldingCids: ['#cash-holding-1', '#cash-holding-2'],
  expiresAt: '2026-07-10T01:30:00Z',
  availableActions: [['AIA_Accept', [['Custodian::provider']]]],
  meta: { values: { registry: 'cash' } },
};

function activeContract(params: {
  readonly contractId: string;
  readonly kind: 'Completed' | 'Pending';
  readonly viewValue?: unknown;
  readonly interfaceId?: string;
  readonly viewStatusCode?: number;
  readonly synchronizerId?: string;
}): JsGetActiveContractsResponseItem {
  const interfaceId =
    params.interfaceId ??
    (params.kind === 'Completed'
      ? `allocation-package-hash:${TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID.split(':').slice(1).join(':')}`
      : `instruction-package-hash:${TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID.split(':').slice(1).join(':')}`);
  return {
    workflowId: `workflow-${params.contractId}`,
    contractEntry: {
      JsActiveContract: {
        synchronizerId: params.synchronizerId ?? synchronizerId,
        reassignmentCounter: 0,
        createdEvent: {
          offset: 10,
          nodeId: 1,
          contractId: params.contractId,
          templateId: 'registry-package:Registry:AllocationState',
          contractKey: null,
          createArgument: {},
          createdEventBlob: '',
          interfaceViews: [
            {
              interfaceId,
              viewStatus: {
                code: params.viewStatusCode ?? 0,
                message: params.viewStatusCode ? 'view unavailable' : '',
              },
              ...(params.viewValue === undefined ? {} : { viewValue: params.viewValue }),
            },
          ],
          witnessParties: ['Buyer::alice'],
          signatories: ['CashAdmin::issuer'],
          observers: ['Buyer::alice'],
          createdAt: '2026-07-10T01:00:01Z',
          packageName: 'registry-package',
        },
      },
    },
  };
}

function incompleteReassignment(kind: 'Assigned' | 'Unassigned', contractId: string): JsGetActiveContractsResponseItem {
  const event = {
    offset: 10,
    nodeId: 1,
    contractId,
    templateId: 'registry-package:Registry:AllocationState',
    source: kind === 'Assigned' ? 'other-domain::1220other' : synchronizerId,
    target: kind === 'Assigned' ? synchronizerId : 'other-domain::1220other',
    reassignmentId: `reassignment-${contractId}`,
    submitter: 'CashAdmin::issuer',
    reassignmentCounter: 1,
    packageName: 'registry-package',
  };
  if (kind === 'Assigned') {
    return { contractEntry: { JsIncompleteAssigned: { assignedEvent: event } } };
  }

  const active = activeContract({ contractId, kind: 'Completed', viewValue: completedView });
  if (!('JsActiveContract' in active.contractEntry)) throw new Error('Expected an active contract fixture');
  return {
    contractEntry: {
      JsIncompleteUnassigned: {
        createdEvent: active.contractEntry.JsActiveContract.createdEvent,
        unassignedEvent: event,
      },
    },
  };
}

function createLedger(response: JsGetActiveContractsResponseItem[]): TokenStandardV2AllocationStateClient & {
  readonly getActiveContracts: jest.Mock;
} {
  return {
    getActiveContracts: jest.fn(async () => response),
  };
}

describe('discoverTokenStandardV2AllocationState', () => {
  test('uses one exact interface-filtered ACS query and returns a semantically matching Completed view', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#allocation',
        kind: 'Completed',
        viewValue: completedView,
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: [' Buyer::alice ', 'Buyer::alice', ' Venue::operator '],
        synchronizerId: ` ${synchronizerId} `,
        request,
        activeAtOffset: 42,
      })
    ).resolves.toEqual({
      type: 'Completed',
      allocationCid: '#allocation',
      view: completedView,
    });

    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
    expect(ledger.getActiveContracts).toHaveBeenCalledWith({
      parties: ['Buyer::alice', 'Venue::operator'],
      interfaceIds: [TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID, TOKEN_STANDARD_V2_ALLOCATION_INSTRUCTION_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: false,
      activeAtOffset: 42,
    });
  });

  test('returns Pending only when requestedAt and inputHoldingCids also match', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#allocation-instruction',
        kind: 'Pending',
        viewValue: pendingView,
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).resolves.toEqual({
      type: 'Pending',
      allocationInstructionCid: '#allocation-instruction',
      view: pendingView,
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('returns Unknown for an empty ACS and never infers Failed', async () => {
    const ledger = createLedger([]);

    const state = await discoverTokenStandardV2AllocationState({
      ledger,
      parties: ['Buyer::alice'],
      synchronizerId,
      request,
      activeAtOffset: 42,
    });

    expect(state).toEqual({ type: 'Unknown' });
    expect(state.type).not.toBe('Failed');
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('skips JsEmpty, unrelated views, and wrong-synchronizer views before decoding', async () => {
    const ledger = createLedger([
      { contractEntry: { JsEmpty: {} } },
      activeContract({
        contractId: '#unrelated',
        kind: 'Completed',
        interfaceId: '#other-package:Other.Module:OtherInterface',
        viewValue: null,
      }),
      activeContract({
        contractId: '#different-request',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          settlement: { ...completedView.settlement, id: 'different-settlement' },
        },
      }),
      activeContract({
        contractId: '#other-synchronizer',
        kind: 'Completed',
        synchronizerId: 'other-domain::1220other',
        viewValue: { malformed: true },
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).resolves.toEqual({ type: 'Unknown' });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('fails closed when a requested allocation interface view fails', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#failed-view',
        kind: 'Completed',
        viewStatusCode: 13,
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.INTERFACE_VIEW_INVALID,
      context: {
        contractId: '#failed-view',
        viewStatusCode: 13,
        viewStatusMessage: 'view unavailable',
      },
    });
  });

  test.each(['Assigned', 'Unassigned'] as const)(
    'fails closed for an incomplete %s reassignment row on the selected synchronizer',
    async (kind) => {
      const contractId = `#incomplete-${kind.toLowerCase()}`;
      const ledger = createLedger([incompleteReassignment(kind, contractId)]);

      await expect(
        discoverTokenStandardV2AllocationState({
          ledger,
          parties: ['Buyer::alice'],
          synchronizerId,
          request,
          activeAtOffset: 42,
        })
      ).rejects.toMatchObject({
        code: TokenStandardV2AllocationStateErrorCode.ACS_INCOMPLETE,
        context: { contractId },
      });
    }
  );

  test('normalizes duplicate visibility rows by contract ID', async () => {
    const duplicate = activeContract({
      contractId: '#allocation',
      kind: 'Completed',
      viewValue: completedView,
    });
    const ledger = createLedger([duplicate, { ...duplicate, workflowId: 'visible-to-second-party' }]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice', 'Venue::operator'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).resolves.toMatchObject({
      type: 'Completed',
      allocationCid: '#allocation',
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['nonidentity data', { ...completedView, meta: { values: { registry: 'different' } } }],
    [
      'request identity',
      {
        ...completedView,
        settlement: { ...completedView.settlement, id: 'different-settlement' },
      },
    ],
  ] as const)('rejects duplicate visibility rows with inconsistent %s', async (_case, inconsistentView) => {
    const ledger = createLedger([
      activeContract({ contractId: '#allocation', kind: 'Completed', viewValue: completedView }),
      activeContract({
        contractId: '#allocation',
        kind: 'Completed',
        viewValue: inconsistentView,
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice', 'Venue::operator'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.INTERFACE_VIEW_INVALID,
      context: { contractId: '#allocation' },
    });
  });

  test.each([
    [
      'multiple Completed CIDs',
      [
        activeContract({ contractId: '#allocation-1', kind: 'Completed', viewValue: completedView }),
        activeContract({ contractId: '#allocation-2', kind: 'Completed', viewValue: completedView }),
      ],
      ['#allocation-1', '#allocation-2'],
      [],
    ],
    [
      'multiple Pending CIDs',
      [
        activeContract({ contractId: '#instruction-1', kind: 'Pending', viewValue: pendingView }),
        activeContract({ contractId: '#instruction-2', kind: 'Pending', viewValue: pendingView }),
      ],
      [],
      ['#instruction-1', '#instruction-2'],
    ],
    [
      'both Completed and Pending',
      [
        activeContract({ contractId: '#allocation', kind: 'Completed', viewValue: completedView }),
        activeContract({ contractId: '#instruction', kind: 'Pending', viewValue: pendingView }),
      ],
      ['#allocation'],
      ['#instruction'],
    ],
  ] as const)('fails closed with typed ambiguity for %s', async (_name, rows, completedCids, pendingCids) => {
    const ledger = createLedger([...rows]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2AllocationStateError',
      code: TokenStandardV2AllocationStateErrorCode.AMBIGUOUS,
      context: { completedCids: [...completedCids], pendingCids: [...pendingCids] },
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('returns Unknown when any standard request identity field mismatches', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#settlement-metadata-mismatch',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          settlement: {
            ...completedView.settlement,
            meta: { values: { ...completedView.settlement.meta.values, trade: 'different-trade' } },
          },
        },
      }),
      activeContract({
        contractId: '#allocation-mismatch',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          allocation: { ...completedView.allocation, committed: false },
        },
      }),
      activeContract({
        contractId: '#leg-mismatch',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          allocation: {
            ...completedView.allocation,
            transferLegSides: [{ ...cashLeg, amount: '26.0' }, feeLeg],
          },
        },
      }),
      activeContract({
        contractId: '#requested-at-mismatch',
        kind: 'Pending',
        viewValue: { ...pendingView, requestedAt: '2026-07-10T01:00:01Z' },
      }),
      activeContract({
        contractId: '#input-holdings-mismatch',
        kind: 'Pending',
        viewValue: { ...pendingView, inputHoldingCids: [...pendingView.inputHoldingCids].reverse() },
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).resolves.toEqual({ type: 'Unknown' });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('rejects a malformed successful matching view with a typed error', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#malformed-allocation',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          allocation: { ...completedView.allocation, committed: 'true' },
        },
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2AllocationStateError',
      code: TokenStandardV2AllocationStateErrorCode.INTERFACE_VIEW_INVALID,
      context: { contractId: '#malformed-allocation' },
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('rejects duplicate transfer-leg sides in a matching interface view', async () => {
    const ledger = createLedger([
      activeContract({
        contractId: '#duplicate-transfer-leg-side',
        kind: 'Completed',
        viewValue: {
          ...completedView,
          allocation: {
            ...completedView.allocation,
            transferLegSides: [cashLeg, { ...cashLeg, amount: '26.0' }],
          },
        },
      }),
    ]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.INTERFACE_VIEW_INVALID,
      context: {
        contractId: '#duplicate-transfer-leg-side',
        field: 'view.allocation.transferLegSides',
      },
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'leading-plus decimal',
      {
        ...request,
        allocation: {
          ...request.allocation,
          transferLegSides: [{ ...cashLeg, amount: '+25.0' }, feeLeg],
        },
      },
    ],
    [
      'duplicate transfer-leg sides',
      {
        ...request,
        allocation: {
          ...request.allocation,
          transferLegSides: [cashLeg, { ...cashLeg, amount: '26.0' }],
        },
      },
    ],
    [
      'zero-valued next-iteration funding',
      {
        ...request,
        allocation: {
          ...request.allocation,
          nextIterationFunding: { USD: '0' },
        },
      },
    ],
  ] as const)('rejects a request containing %s before querying Canton', async (_case, invalidRequest) => {
    const ledger = createLedger([]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        request: invalidRequest,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({ code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });

  test('requires activeAtOffset at compile time and rejects runtime omission before querying Canton', async () => {
    const ledger = createLedger([]);
    const paramsWithoutOffset = {
      ledger,
      parties: ['Buyer::alice'],
      synchronizerId,
      request,
    };

    // @ts-expect-error activeAtOffset is required to keep recovery to one network read.
    const recovery = discoverTokenStandardV2AllocationState(paramsWithoutOffset);
    await expect(recovery).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID,
      context: { field: 'activeAtOffset' },
    });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });

  test('rejects a malformed top-level request with a typed error', async () => {
    await expect(discoverTokenStandardV2AllocationState(null as never)).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID,
      context: { field: 'params' },
    });
  });

  test('requires explicit parties and synchronizer before querying the ledger', async () => {
    const ledger = createLedger([]);

    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: [],
        synchronizerId,
        request,
        activeAtOffset: 42,
      })
    ).rejects.toBeInstanceOf(TokenStandardV2AllocationStateError);
    await expect(
      discoverTokenStandardV2AllocationState({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId: ' ',
        request,
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({ code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });
});

describe('getTokenStandardV2AllocationViewsByContractIds', () => {
  test('normalizes omitted optional interface-view fields to null', async () => {
    const viewValue = {
      ...completedView,
      originalAllocationCid: undefined,
      settlement: {
        ...completedView.settlement,
        cid: undefined,
      },
      allocation: {
        ...completedView.allocation,
        authorizer: {
          ...completedView.allocation.authorizer,
          provider: undefined,
        },
        settlementDeadline: undefined,
        nextIterationFunding: undefined,
      },
      expiresAt: undefined,
    };
    const ledger = createLedger([activeContract({ contractId: '#allocation', kind: 'Completed', viewValue })]);

    await expect(
      getTokenStandardV2AllocationViewsByContractIds({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        allocationCids: ['#allocation'],
        activeAtOffset: 42,
      })
    ).resolves.toEqual([
      {
        allocationCid: '#allocation',
        view: {
          ...completedView,
          originalAllocationCid: null,
          settlement: {
            ...completedView.settlement,
            cid: null,
          },
          allocation: {
            ...completedView.allocation,
            authorizer: {
              ...completedView.allocation.authorizer,
              provider: null,
            },
            settlementDeadline: null,
            nextIterationFunding: null,
          },
          expiresAt: null,
        },
      },
    ]);
  });

  test('normalizes string maps to null-prototype records with non-writable prototype keys', async () => {
    const metadataValues = Object.fromEntries([
      ['__proto__', 'metadata-prototype'],
      ['constructor', 'metadata-constructor'],
    ]);
    const fundingValues = Object.fromEntries([
      ['__proto__', '1.0'],
      ['constructor', '2.0'],
    ]);
    const viewValue = {
      ...completedView,
      allocation: {
        ...completedView.allocation,
        meta: { values: metadataValues },
        nextIterationFunding: fundingValues,
      },
    };
    const ledger = createLedger([activeContract({ contractId: '#allocation', kind: 'Completed', viewValue })]);

    const [allocation] = await getTokenStandardV2AllocationViewsByContractIds({
      ledger,
      parties: ['Buyer::alice'],
      synchronizerId,
      allocationCids: ['#allocation'],
      activeAtOffset: 42,
    });
    if (!allocation) throw new Error('Expected the allocation fixture');
    const normalizedMetadata = allocation.view.allocation.meta.values;
    const normalizedFunding = allocation.view.allocation.nextIterationFunding;
    if (!normalizedFunding) throw new Error('Expected next-iteration funding');

    expect(Object.getPrototypeOf(normalizedMetadata)).toBeNull();
    expect(Reflect.get(normalizedMetadata, '__proto__')).toBe('metadata-prototype');
    expect(normalizedMetadata['constructor']).toBe('metadata-constructor');
    expect(Object.getOwnPropertyDescriptor(normalizedMetadata, '__proto__')?.writable).toBe(false);
    expect(Object.getPrototypeOf(normalizedFunding)).toBeNull();
    expect(Reflect.get(normalizedFunding, '__proto__')).toBe('1.0');
    expect(normalizedFunding['constructor']).toBe('2.0');
    expect(Object.getOwnPropertyDescriptor(normalizedFunding, 'constructor')?.writable).toBe(false);
  });

  test('returns exact allocation CIDs in caller order from one ACS snapshot', async () => {
    const firstTransferLegSide = requireFixtureValue(
      completedView.allocation.transferLegSides[0],
      'completed allocation first transfer-leg side'
    );
    const secondView: TokenStandardV2AllocationView = {
      ...completedView,
      allocation: {
        ...completedView.allocation,
        authorizer: firstTransferLegSide.otherside,
        transferLegSides: [
          {
            ...firstTransferLegSide,
            side: 'ReceiverSide',
            otherside: completedView.allocation.authorizer,
          },
        ],
      },
    };
    const ledger = createLedger([
      activeContract({ contractId: '#sender', kind: 'Completed', viewValue: completedView }),
      activeContract({ contractId: '#receiver', kind: 'Completed', viewValue: secondView }),
      activeContract({
        contractId: '#unrelated',
        kind: 'Completed',
        viewValue: { malformed: true },
      }),
      activeContract({
        contractId: '#wrong-synchronizer',
        kind: 'Completed',
        synchronizerId: 'other-domain::1220other',
        viewValue: { malformed: true },
      }),
    ]);

    await expect(
      getTokenStandardV2AllocationViewsByContractIds({
        ledger,
        parties: [' Buyer::alice ', 'Venue::operator'],
        synchronizerId,
        allocationCids: ['#receiver', '#sender'],
        activeAtOffset: 42,
      })
    ).resolves.toEqual([
      { allocationCid: '#receiver', view: secondView },
      { allocationCid: '#sender', view: completedView },
    ]);
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
    expect(ledger.getActiveContracts).toHaveBeenCalledWith({
      parties: ['Buyer::alice', 'Venue::operator'],
      interfaceIds: [TOKEN_STANDARD_V2_ALLOCATION_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: false,
      activeAtOffset: 42,
    });
  });

  test('reports every requested allocation missing from the snapshot', async () => {
    const ledger = createLedger([
      activeContract({ contractId: '#sender', kind: 'Completed', viewValue: completedView }),
    ]);

    await expect(
      getTokenStandardV2AllocationViewsByContractIds({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        allocationCids: ['#sender', '#receiver', '#other'],
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2AllocationStateErrorCode.NOT_FOUND,
      context: {
        missingAllocationCids: ['#receiver', '#other'],
        activeAtOffset: 42,
      },
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
  });

  test('rejects duplicate or empty allocation CID inputs before querying Canton', async () => {
    const ledger = createLedger([]);
    await expect(
      getTokenStandardV2AllocationViewsByContractIds({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        allocationCids: ['#allocation', '#allocation'],
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({ code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID });
    await expect(
      getTokenStandardV2AllocationViewsByContractIds({
        ledger,
        parties: ['Buyer::alice'],
        synchronizerId,
        allocationCids: [],
        activeAtOffset: 42,
      })
    ).rejects.toMatchObject({ code: TokenStandardV2AllocationStateErrorCode.INPUT_INVALID });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });
});
