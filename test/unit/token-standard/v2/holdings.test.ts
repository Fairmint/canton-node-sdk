import type { JsGetActiveContractsResponseItem } from '../../../../src/clients/ledger-json-api/schemas';
import {
  listTokenStandardV2Holdings,
  selectTokenStandardV2Holdings,
  TOKEN_STANDARD_V2_HOLDING_INTERFACE_ID,
  TokenStandardV2HoldingError,
  type TokenStandardV2Account,
  type TokenStandardV2HoldingActiveContractsClient,
  type TokenStandardV2InstrumentId,
} from '../../../../src/utils/token-standard';

const account: TokenStandardV2Account = {
  owner: 'Buyer::alice',
  provider: null,
  id: '',
};
const instrumentId: TokenStandardV2InstrumentId = {
  admin: 'CashAdmin::issuer',
  id: 'USD',
};
const synchronizerId = 'global-domain::1220primary';

function activeHolding(params: {
  readonly contractId: string;
  readonly amount: string;
  readonly account?: TokenStandardV2Account;
  readonly instrumentId?: TokenStandardV2InstrumentId;
  readonly lock?: unknown;
  readonly createdAt?: string;
  readonly viewStatusCode?: number;
  readonly viewStatusMessage?: string;
  readonly synchronizerId?: string;
  readonly interfaceId?: string;
  readonly omitViewValue?: boolean;
  readonly omitLock?: boolean;
  readonly meta?: unknown;
}): JsGetActiveContractsResponseItem {
  const viewValue = {
    account: params.account ?? account,
    instrumentId: params.instrumentId ?? instrumentId,
    amount: params.amount,
    ...(!params.omitLock ? { lock: params.lock ?? null } : {}),
    meta: params.meta ?? { values: {} },
  };
  return {
    contractEntry: {
      JsActiveContract: {
        synchronizerId: params.synchronizerId ?? synchronizerId,
        reassignmentCounter: 0,
        createdEvent: {
          offset: 1,
          nodeId: 1,
          contractId: params.contractId,
          templateId: '#cash-token:Cash:Holding',
          contractKey: null,
          createArgument: {},
          createdEventBlob: '',
          interfaceViews: [
            {
              interfaceId: params.interfaceId ?? '#holding-package-id:Splice.Api.Token.HoldingV2:Holding',
              viewStatus: {
                code: params.viewStatusCode ?? 0,
                message: params.viewStatusMessage ?? '',
              },
              ...(!params.omitViewValue ? { viewValue } : {}),
            },
          ],
          witnessParties: ['Buyer::alice'],
          signatories: ['CashAdmin::issuer'],
          observers: ['Buyer::alice'],
          createdAt: params.createdAt ?? '2026-07-10T01:00:00.000Z',
          packageName: 'cash-token',
          implementedInterfaces: ['#holding-package-id:Splice.Api.Token.HoldingV2:Holding'],
        },
      },
    },
  };
}

function withoutCreatedAt(item: JsGetActiveContractsResponseItem): JsGetActiveContractsResponseItem {
  if (!('JsActiveContract' in item.contractEntry)) throw new Error('Expected an active contract fixture');
  delete (item.contractEntry.JsActiveContract.createdEvent as { createdAt?: unknown }).createdAt;
  return item;
}

function createLedger(
  holdings: readonly JsGetActiveContractsResponseItem[]
): TokenStandardV2HoldingActiveContractsClient & {
  readonly getActiveContracts: jest.Mock;
} {
  return {
    getActiveContracts: jest.fn(async () => [...holdings]),
  };
}

describe('Token Standard V2 holdings', () => {
  test('queries HoldingV2 once and deterministically selects the fewest contracts', async () => {
    const seven = activeHolding({ contractId: '#seven', amount: '7.0000000000' });
    const ledger = createLedger([
      activeHolding({ contractId: '#four', amount: '4.0000000000' }),
      seven,
      seven,
      activeHolding({
        contractId: '#other-synchronizer',
        amount: '1000.0',
        synchronizerId: 'other-domain::1220secondary',
        viewStatusCode: 3,
      }),
      activeHolding({
        contractId: '#locked',
        amount: '100.0',
        lock: {
          holders: ['CashAdmin::issuer'],
          expiresAt: null,
          expiresAfter: null,
          context: null,
        },
      }),
      activeHolding({
        contractId: '#other-owner',
        amount: '100.0',
        account: { ...account, owner: 'Other::owner' },
      }),
    ]);

    await expect(
      selectTokenStandardV2Holdings({
        ledger,
        parties: [' Buyer::alice ', 'Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
        activeAtOffset: 42,
        amountBaseUnits: '8000000',
      })
    ).resolves.toEqual({
      holdings: [
        expect.objectContaining({
          contractId: '#seven',
          amountBaseUnits: '7000000',
        }),
        expect.objectContaining({
          contractId: '#four',
          amountBaseUnits: '4000000',
        }),
      ],
      contractIds: ['#seven', '#four'],
      totalBaseUnits: '11000000',
    });
    expect(ledger.getActiveContracts).toHaveBeenCalledTimes(1);
    expect(ledger.getActiveContracts).toHaveBeenCalledWith({
      parties: ['Buyer::alice'],
      interfaceIds: [TOKEN_STANDARD_V2_HOLDING_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: false,
      activeAtOffset: 42,
    });
  });

  test('filters by the full Account and InstrumentId before validating unrelated values', async () => {
    const ledger = createLedger([
      activeHolding({ contractId: '#match', amount: '1.0' }),
      activeHolding({
        contractId: '#other-account-id',
        amount: '2.0000001',
        account: { ...account, id: 'custody-2' },
      }),
      activeHolding({
        contractId: '#other-instrument',
        amount: '3.0000001',
        instrumentId: { ...instrumentId, id: 'EUR' },
      }),
    ]);

    await expect(
      listTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        contractId: '#match',
        amountBaseUnits: '1000000',
      }),
    ]);
  });

  test('throws the typed interface error when the requested view fails on the selected synchronizer', async () => {
    const ledger = createLedger([
      activeHolding({
        contractId: '#failed-view',
        amount: '1.0',
        viewStatusCode: 3,
        viewStatusMessage: 'HoldingV2 view computation failed',
        omitViewValue: true,
      }),
    ]);

    await expect(
      selectTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
        activeAtOffset: 42,
        amountBaseUnits: '1000000',
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_INTERFACE_VIEW_INVALID',
      context: {
        contractId: '#failed-view',
        viewStatusCode: 3,
        viewStatusMessage: 'HoldingV2 view computation failed',
      },
    });
  });

  test('exposes createdAt for a token-specific relative-lock spendability policy', async () => {
    const ledger = createLedger([
      activeHolding({
        contractId: '#relative-expired-lock',
        amount: '5.0',
        lock: {
          holders: ['CashAdmin::issuer'],
          expiresAt: null,
          expiresAfter: { microseconds: '3600000000' },
          context: 'cash-lock',
        },
        meta: { values: { source: 'cash-token' } },
      }),
    ]);

    await expect(
      listTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        contractId: '#relative-expired-lock',
        createdAt: '2026-07-10T01:00:00.000Z',
        lock: expect.objectContaining({ context: 'cash-lock' }),
        meta: { values: { source: 'cash-token' } },
      }),
    ]);

    await expect(
      selectTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
        activeAtOffset: 42,
        amountBaseUnits: '5000000',
        isSpendable: (holding) => {
          if (!holding.lock?.expiresAfter) return false;
          const createdAtMicroseconds = BigInt(Date.parse(holding.createdAt)) * 1000n;
          const absoluteExpiryMicroseconds = createdAtMicroseconds + BigInt(holding.lock.expiresAfter.microseconds);
          const evaluationTimeMicroseconds = BigInt(Date.parse('2026-07-10T02:00:00.000Z')) * 1000n;
          return absoluteExpiryMicroseconds <= evaluationTimeMicroseconds;
        },
      })
    ).resolves.toMatchObject({
      contractIds: ['#relative-expired-lock'],
      totalBaseUnits: '5000000',
    });
  });

  test.each([
    [
      'missing',
      '#missing-created-at',
      withoutCreatedAt(activeHolding({ contractId: '#missing-created-at', amount: '1.0' })),
    ],
    [
      'malformed',
      '#malformed-created-at',
      activeHolding({
        contractId: '#malformed-created-at',
        amount: '1.0',
        createdAt: '2026-02-31T00:00:00.000Z',
      }),
    ],
  ] as const)('fails closed when a matching active holding has a %s createdAt', async (_case, contractId, holding) => {
    const ledger = createLedger([holding]);

    await expect(
      listTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_INTERFACE_VIEW_INVALID',
      context: { contractId },
    });
  });

  test('skips non-active ACS variants and rejects a missing lock field', async () => {
    const ledger = createLedger([
      { contractEntry: { JsEmpty: {} } },
      activeHolding({ contractId: '#match', amount: '1.0' }),
    ]);
    await expect(
      listTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
      })
    ).resolves.toEqual([expect.objectContaining({ contractId: '#match', lock: null })]);

    const malformedLedger = createLedger([
      activeHolding({
        contractId: '#missing-lock',
        amount: '1.0',
        omitLock: true,
      }),
    ]);
    await expect(
      listTokenStandardV2Holdings({
        ledger: malformedLedger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
      })
    ).rejects.toBeInstanceOf(TokenStandardV2HoldingError);
  });

  test('reports insufficient balances in base units', async () => {
    const ledger = createLedger([activeHolding({ contractId: '#one', amount: '1.0' })]);

    await expect(
      selectTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
        activeAtOffset: 42,
        amountBaseUnits: '2000000',
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_BALANCE_INSUFFICIENT',
      context: {
        requiredBaseUnits: '2000000',
        availableBaseUnits: '1000000',
      },
    });
  });

  test('rejects non-zero precision beyond the instrument decimals', async () => {
    const ledger = createLedger([activeHolding({ contractId: '#over-precise', amount: '1.0000001' })]);

    await expect(
      listTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_INTERFACE_VIEW_INVALID',
    });
  });

  test('validates positive base-unit requests before querying Canton', async () => {
    const ledger = createLedger([]);

    await expect(
      selectTokenStandardV2Holdings({
        ledger,
        parties: ['Buyer::alice'],
        account,
        instrumentId,
        instrumentDecimals: 6,
        synchronizerId,
        activeAtOffset: 42,
        amountBaseUnits: '0',
      })
    ).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_INPUT_INVALID',
    });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });

  test('requires activeAtOffset at compile time and rejects runtime omission before querying Canton', async () => {
    const ledger = createLedger([]);
    const requestWithoutOffset = {
      ledger,
      parties: ['Buyer::alice'],
      account,
      instrumentId,
      instrumentDecimals: 6,
      synchronizerId,
      amountBaseUnits: '1000000',
    };

    // @ts-expect-error activeAtOffset is required by the high-level selection request.
    const selection = selectTokenStandardV2Holdings(requestWithoutOffset);
    await expect(selection).rejects.toMatchObject({
      code: 'TOKEN_STANDARD_V2_HOLDING_INPUT_INVALID',
      context: { field: 'activeAtOffset' },
    });
    expect(ledger.getActiveContracts).not.toHaveBeenCalled();
  });
});
