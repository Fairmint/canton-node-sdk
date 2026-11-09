import {
  buildEventFormat,
  buildTransactionFormat,
  buildUpdateFormat,
} from '../../../src/clients/ledger-json-api/operations/v2/utils/event-format-builder';

const ASSET_INTERFACE = '#example-package:Example.Module:Asset';
const REGISTRY_INTERFACE = '#example-package:Example.Module:Registry';

describe('buildEventFormat', () => {
  it('builds interface-only filters with interface views enabled by default', () => {
    expect(
      buildEventFormat({
        parties: ['Alice'],
        interfaceIds: ['#token-standard:Splice.Api.Token.HoldingV1:Holding'],
        includeCreatedEventBlob: true,
      })
    ).toEqual({
      verbose: false,
      filtersByParty: {
        Alice: {
          cumulative: [
            {
              identifierFilter: {
                InterfaceFilter: {
                  value: {
                    interfaceId: '#token-standard:Splice.Api.Token.HoldingV1:Holding',
                    includeInterfaceView: true,
                    includeCreatedEventBlob: true,
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  it('combines template and interface filters with configurable interface views', () => {
    expect(
      buildEventFormat({
        parties: ['Alice'],
        templateIds: ['#wallet:Splice.Wallet.Install:WalletAppInstall'],
        interfaceIds: ['#token-standard:Splice.Api.Token.HoldingV1:Holding'],
        includeInterfaceView: false,
      }).filtersByParty['Alice']?.cumulative
    ).toEqual([
      {
        identifierFilter: {
          TemplateFilter: {
            value: {
              templateId: '#wallet:Splice.Wallet.Install:WalletAppInstall',
              includeCreatedEventBlob: false,
            },
          },
        },
      },
      {
        identifierFilter: {
          InterfaceFilter: {
            value: {
              interfaceId: '#token-standard:Splice.Api.Token.HoldingV1:Holding',
              includeInterfaceView: false,
              includeCreatedEventBlob: false,
            },
          },
        },
      },
    ]);
  });

  it('preserves the existing template-only filter shape', () => {
    expect(
      buildEventFormat({
        parties: ['Alice'],
        templateIds: ['#wallet:Splice.Wallet.Install:WalletAppInstall'],
        includeCreatedEventBlob: true,
      }).filtersByParty['Alice']?.cumulative
    ).toEqual([
      {
        identifierFilter: {
          TemplateFilter: {
            value: {
              templateId: '#wallet:Splice.Wallet.Install:WalletAppInstall',
              includeCreatedEventBlob: true,
            },
          },
        },
      },
    ]);
  });

  it('gives each party its own filter objects, so adjusting one party leaves the others alone', () => {
    const format = buildEventFormat({
      parties: ['Alice', 'Bob'],
      templateIds: ['#wallet:Splice.Wallet.Install:WalletAppInstall'],
      includeCreatedEventBlob: true,
    });
    const alice = format.filtersByParty['Alice']?.cumulative;
    const bob = format.filtersByParty['Bob']?.cumulative;
    expect(alice).toEqual(bob);
    expect(alice).not.toBe(bob);
    expect(alice?.[0]).not.toBe(bob?.[0]);
    alice?.push({ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } });
    expect(bob).toHaveLength(1);
  });
});

describe('buildTransactionFormat', () => {
  it('wraps the event format and defaults to the LedgerEffects shape', () => {
    const params = { parties: ['Alice'], interfaceIds: [ASSET_INTERFACE] };

    expect(buildTransactionFormat(params)).toEqual({
      eventFormat: buildEventFormat(params),
      transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
    });
  });

  it('uses the given transaction shape', () => {
    expect(
      buildTransactionFormat({ parties: ['Alice'], transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA' }).transactionShape
    ).toBe('TRANSACTION_SHAPE_ACS_DELTA');
  });

  it('requires at least one party', () => {
    expect(() => buildTransactionFormat({ parties: [] })).toThrow('At least one party is required');
  });
});

describe('buildUpdateFormat', () => {
  const params = {
    parties: ['Alice', 'Bob'],
    interfaceIds: [ASSET_INTERFACE, REGISTRY_INTERFACE],
    includeCreatedEventBlob: true,
  };
  const eventFormat = buildEventFormat(params);

  it('includes transactions and reassignments by default, without topology events', () => {
    const updateFormat = buildUpdateFormat(params);

    expect(updateFormat).toStrictEqual({
      includeTransactions: { eventFormat, transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS' },
      includeReassignments: { filtersByParty: eventFormat.filtersByParty, verbose: false },
    });
  });

  it('drops reassignments when disabled', () => {
    expect(buildUpdateFormat({ ...params, includeReassignments: false })).toStrictEqual({
      includeTransactions: { eventFormat, transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS' },
    });
  });

  it('adds participant authorization topology events for the parties when enabled', () => {
    expect(buildUpdateFormat({ ...params, includeTopologyEvents: true })).toStrictEqual({
      includeTransactions: { eventFormat, transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS' },
      includeReassignments: { filtersByParty: eventFormat.filtersByParty, verbose: false },
      includeTopologyEvents: { includeParticipantAuthorizationEvents: { parties: ['Alice', 'Bob'] } },
    });
  });

  it('builds transactions only, with the ACS delta shape', () => {
    expect(
      buildUpdateFormat({
        ...params,
        includeReassignments: false,
        includeTopologyEvents: false,
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      })
    ).toStrictEqual({
      includeTransactions: { eventFormat, transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA' },
    });
  });

  it('builds all three update kinds together', () => {
    const updateFormat = buildUpdateFormat({ ...params, includeReassignments: true, includeTopologyEvents: true });

    expect(Object.keys(updateFormat)).toEqual(['includeTransactions', 'includeReassignments', 'includeTopologyEvents']);
  });
});

describe('any-party formats', () => {
  const wildcard = (includeCreatedEventBlob: boolean): Record<string, unknown> => ({
    cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob } } } }],
  });

  it('builds filtersForAnyParty with an explicit wildcard and no party filters', () => {
    expect(buildEventFormat({ anyParty: true })).toEqual({
      verbose: false,
      filtersByParty: {},
      filtersForAnyParty: wildcard(false),
    });
  });

  it('carries includeCreatedEventBlob and verbose on the any-party wildcard', () => {
    expect(buildEventFormat({ anyParty: true, includeCreatedEventBlob: true, verbose: true })).toEqual({
      verbose: true,
      filtersByParty: {},
      filtersForAnyParty: wildcard(true),
    });
  });

  it('puts template and interface filters under filtersForAnyParty', () => {
    expect(
      buildEventFormat({
        anyParty: true,
        templateIds: ['#pkg:Mod:T'],
        interfaceIds: [ASSET_INTERFACE],
        includeInterfaceView: false,
        includeCreatedEventBlob: true,
      })
    ).toEqual({
      verbose: false,
      filtersByParty: {},
      filtersForAnyParty: {
        cumulative: [
          {
            identifierFilter: {
              TemplateFilter: { value: { templateId: '#pkg:Mod:T', includeCreatedEventBlob: true } },
            },
          },
          {
            identifierFilter: {
              InterfaceFilter: {
                value: { interfaceId: ASSET_INTERFACE, includeInterfaceView: false, includeCreatedEventBlob: true },
              },
            },
          },
        ],
      },
    });
  });

  it('never consults a party list', () => {
    const format = buildEventFormat({ anyParty: true });
    expect(Object.keys(format.filtersByParty)).toEqual([]);
  });

  it('rejects both a party list and anyParty, and anyParty other than true, from untyped callers', () => {
    const both = { anyParty: true, parties: ['Alice'] } as unknown as Parameters<typeof buildEventFormat>[0];
    expect(() => buildEventFormat(both)).toThrow('Pass either anyParty: true or parties to the event format builder');
    const notTrue = { anyParty: false, parties: ['Alice'] } as unknown as Parameters<typeof buildEventFormat>[0];
    expect(() => buildEventFormat(notTrue)).toThrow('Pass either anyParty: true or parties');
    const falseAlone = { anyParty: false } as unknown as Parameters<typeof buildEventFormat>[0];
    expect(() => buildEventFormat(falseAlone)).toThrow('anyParty must be true when it is given');
    const neither = {} as unknown as Parameters<typeof buildEventFormat>[0];
    expect(() => buildEventFormat(neither)).toThrow('At least one party is required');
  });

  it('builds the raw ingester update format: LedgerEffects, reassignments and topology events for every party', () => {
    expect(
      buildUpdateFormat({ anyParty: true, includeCreatedEventBlob: true, includeTopologyEvents: true, verbose: true })
    ).toEqual({
      includeTransactions: {
        eventFormat: { verbose: true, filtersByParty: {}, filtersForAnyParty: wildcard(true) },
        transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
      },
      includeReassignments: { verbose: true, filtersByParty: {}, filtersForAnyParty: wildcard(true) },
      // An empty participant-authorization format is every party.
      includeTopologyEvents: { includeParticipantAuthorizationEvents: {} },
    });
  });

  it('builds an any-party transaction format for either shape', () => {
    expect(buildTransactionFormat({ anyParty: true, transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA' })).toEqual({
      eventFormat: { verbose: false, filtersByParty: {}, filtersForAnyParty: wildcard(false) },
      transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
    });
  });

  it('leaves the party-list formats unchanged: no filtersForAnyParty key, verbose false', () => {
    const format = buildUpdateFormat({ parties: ['Alice'], includeTopologyEvents: true });
    expect(format.includeTransactions?.eventFormat).toEqual({
      verbose: false,
      filtersByParty: { Alice: { cumulative: [] } },
    });
    expect(format.includeTransactions?.eventFormat).not.toHaveProperty('filtersForAnyParty');
    expect(format.includeReassignments).toEqual({ filtersByParty: { Alice: { cumulative: [] } }, verbose: false });
    expect(format.includeReassignments).not.toHaveProperty('filtersForAnyParty');
    expect(format.includeTopologyEvents).toEqual({ includeParticipantAuthorizationEvents: { parties: ['Alice'] } });
  });
});
