import {
  resolveTokenStandardV2SettlementFactory,
  TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID,
  TokenStandardV2SettlementFactoryError,
  TokenStandardV2SettlementFactoryErrorCode,
  type TokenStandardV2ActiveContractsQuery,
} from '../../../../src/utils/token-standard/v2';

const admin = 'TokenAdmin::1220admin';
const synchronizerId = 'global-domain::1220primary';
const hashedSettlementFactoryInterfaceId =
  '#051a3b0563a6fa4df4cb34448081e48b061e555aa1a265abf6ae8f3f4cafe439:Splice.Api.Token.AllocationV2:SettlementFactory';

function settlementFactoryEntry(params: {
  readonly contractId: string;
  readonly admin?: string;
  readonly synchronizerId?: string;
  readonly interfaceViews?: readonly unknown[];
  readonly metadata?: Readonly<Record<string, string>>;
}): unknown {
  return {
    contractEntry: {
      JsActiveContract: {
        synchronizerId: params.synchronizerId ?? synchronizerId,
        createdEvent: {
          contractId: params.contractId,
          interfaceViews: params.interfaceViews ?? [
            {
              interfaceId: hashedSettlementFactoryInterfaceId,
              viewStatus: { code: 0, message: '' },
              viewValue: {
                admin: params.admin ?? admin,
                meta: { values: params.metadata ?? {} },
              },
            },
          ],
        },
      },
    },
  };
}

function mockLedger(response: readonly unknown[]): {
  readonly ledger: {
    getActiveContracts(params: TokenStandardV2ActiveContractsQuery): Promise<readonly unknown[]>;
  };
  readonly getActiveContracts: jest.Mock<Promise<readonly unknown[]>, [TokenStandardV2ActiveContractsQuery]>;
} {
  const getActiveContracts = jest.fn(
    async (_params: TokenStandardV2ActiveContractsQuery): Promise<readonly unknown[]> => response
  );
  return { ledger: { getActiveContracts }, getActiveContracts };
}

describe('Token Standard V2 SettlementFactory discovery', () => {
  test('uses the exact interface-filtered ACS query and resolves one admin on one synchronizer', async () => {
    const { ledger, getActiveContracts } = mockLedger([
      settlementFactoryEntry({
        contractId: '#target',
        metadata: { purpose: 'cash-settlement' },
      }),
      settlementFactoryEntry({
        contractId: '#other-admin',
        admin: 'OtherAdmin::1220other',
      }),
    ]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: [' Alice::1220alice ', 'Alice::1220alice', '', 'Bob::1220bob'],
        admin: ` ${admin} `,
        synchronizerId,
      })
    ).resolves.toEqual({
      contractId: '#target',
      synchronizerId,
      view: {
        admin,
        meta: { values: { purpose: 'cash-settlement' } },
      },
    });

    expect(getActiveContracts).toHaveBeenCalledTimes(1);
    expect(getActiveContracts).toHaveBeenCalledWith({
      parties: ['Alice::1220alice', 'Bob::1220bob'],
      interfaceIds: [TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: false,
    });
  });

  test('filters the synchronizer before parsing interface views', async () => {
    const { ledger } = mockLedger([
      {
        contractEntry: {
          JsActiveContract: {
            synchronizerId: 'other-domain::1220secondary',
            createdEvent: null,
          },
        },
      },
      settlementFactoryEntry({ contractId: '#target' }),
    ]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
        synchronizerId,
      })
    ).resolves.toMatchObject({ contractId: '#target', synchronizerId });
  });

  test('reports ambiguity across all synchronizers when no synchronizer is requested', async () => {
    const { ledger } = mockLedger([
      settlementFactoryEntry({ contractId: '#factory-a', synchronizerId }),
      settlementFactoryEntry({
        contractId: '#factory-b',
        synchronizerId: 'other-domain::1220secondary',
      }),
    ]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2SettlementFactoryErrorCode.AMBIGUOUS,
      context: {
        candidates: [
          { contractId: '#factory-a', synchronizerId },
          {
            contractId: '#factory-b',
            synchronizerId: 'other-domain::1220secondary',
          },
        ],
      },
    });
  });

  test('deduplicates the same contract id returned through multiple party visibility paths', async () => {
    const duplicate = settlementFactoryEntry({
      contractId: '#shared-factory',
      metadata: { environment: 'test' },
    });
    const { ledger } = mockLedger([duplicate, duplicate]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice', 'Bob::1220bob'],
        admin,
      })
    ).resolves.toEqual({
      contractId: '#shared-factory',
      synchronizerId,
      view: {
        admin,
        meta: { values: { environment: 'test' } },
      },
    });
  });

  test.each([
    {
      name: 'a missing matching view',
      entry: settlementFactoryEntry({ contractId: '#missing-view', interfaceViews: [] }),
    },
    {
      name: 'a missing view status',
      entry: settlementFactoryEntry({
        contractId: '#missing-status',
        interfaceViews: [
          {
            interfaceId: hashedSettlementFactoryInterfaceId,
            viewValue: { admin, meta: { values: {} } },
          },
        ],
      }),
    },
    {
      name: 'a failed view status',
      entry: settlementFactoryEntry({
        contractId: '#failed-status',
        interfaceViews: [
          {
            interfaceId: hashedSettlementFactoryInterfaceId,
            viewStatus: { code: 13, message: 'view failed' },
          },
        ],
      }),
    },
    {
      name: 'a missing view value',
      entry: settlementFactoryEntry({
        contractId: '#missing-value',
        interfaceViews: [
          {
            interfaceId: hashedSettlementFactoryInterfaceId,
            viewStatus: { code: 0, message: '' },
          },
        ],
      }),
    },
    {
      name: 'malformed metadata',
      entry: settlementFactoryEntry({
        contractId: '#bad-meta',
        interfaceViews: [
          {
            interfaceId: hashedSettlementFactoryInterfaceId,
            viewStatus: { code: 0, message: '' },
            viewValue: { admin, meta: { values: { bad: 1 } } },
          },
        ],
      }),
    },
  ])('fails closed on $name', async ({ entry }) => {
    const { ledger } = mockLedger([entry]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2SettlementFactoryError',
      code: TokenStandardV2SettlementFactoryErrorCode.ACS_ENTRY_INVALID,
    });
  });

  test('fails closed on incomplete reassignment entries', async () => {
    const { ledger } = mockLedger([
      {
        contractEntry: {
          JsIncompleteUnassigned: {
            createdEvent: { contractId: '#incomplete' },
            unassignedEvent: { source: 'source', target: 'target' },
          },
        },
      },
    ]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
      })
    ).rejects.toBeInstanceOf(TokenStandardV2SettlementFactoryError);
    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2SettlementFactoryErrorCode.ACS_ENTRY_INVALID,
      context: { entryKinds: ['JsIncompleteUnassigned'] },
    });
  });

  test('forwards an explicit activeAtOffset', async () => {
    const { ledger, getActiveContracts } = mockLedger([settlementFactoryEntry({ contractId: '#factory' })]);

    await resolveTokenStandardV2SettlementFactory({
      ledger,
      parties: ['Alice::1220alice'],
      admin,
      activeAtOffset: 42,
    });

    expect(getActiveContracts).toHaveBeenCalledWith({
      parties: ['Alice::1220alice'],
      interfaceIds: [TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID],
      includeInterfaceView: true,
      includeCreatedEventBlob: false,
      activeAtOffset: 42,
    });
  });

  test('treats zero matches as not visible and does not invoke a fallback', async () => {
    const { ledger } = mockLedger([]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['Alice::1220alice'],
        admin,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2SettlementFactoryErrorCode.NOT_FOUND,
    });
  });

  test('rejects missing explicit parties as a typed input error before querying ACS', async () => {
    const { ledger, getActiveContracts } = mockLedger([]);

    await expect(
      resolveTokenStandardV2SettlementFactory({
        ledger,
        parties: ['', '   '],
        admin,
      })
    ).rejects.toMatchObject({
      code: TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
    });
    expect(getActiveContracts).not.toHaveBeenCalled();
  });
});
