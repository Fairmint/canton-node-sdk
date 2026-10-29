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
    identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob } } },
  });

  it('still requires a party without anyParty', () => {
    expect(() => buildEventFormat({ parties: [] })).toThrow('At least one party is required');
    expect(() => buildEventFormat({ parties: [], anyParty: false })).toThrow('At least one party is required');
    expect(() => buildUpdateFormat({ parties: [] })).toThrow('At least one party is required');
  });

  it('reads as any party alone with an explicit wildcard and an empty filtersByParty', () => {
    expect(buildEventFormat({ parties: [], anyParty: true, includeCreatedEventBlob: true })).toStrictEqual({
      verbose: false,
      filtersByParty: {},
      filtersForAnyParty: { cumulative: [wildcard(true)] },
    });
    expect(buildEventFormat({ parties: [], anyParty: true }).filtersForAnyParty).toStrictEqual({
      cumulative: [wildcard(false)],
    });
  });

  it('keeps the listed parties beside the any-party filter', () => {
    expect(buildEventFormat({ parties: ['Alice'], anyParty: true, includeCreatedEventBlob: true })).toStrictEqual({
      verbose: false,
      filtersByParty: { Alice: { cumulative: [wildcard(true)] } },
      filtersForAnyParty: { cumulative: [wildcard(true)] },
    });
  });

  it('puts template and interface filters into the any-party filter', () => {
    const format = buildEventFormat({
      parties: [],
      anyParty: true,
      templateIds: ['#wallet:Splice.Wallet.Install:WalletAppInstall'],
      interfaceIds: [ASSET_INTERFACE],
    });

    expect(format.filtersByParty).toStrictEqual({});
    expect(format.filtersForAnyParty?.cumulative).toStrictEqual([
      {
        identifierFilter: {
          TemplateFilter: {
            value: { templateId: '#wallet:Splice.Wallet.Install:WalletAppInstall', includeCreatedEventBlob: false },
          },
        },
      },
      {
        identifierFilter: {
          InterfaceFilter: {
            value: { interfaceId: ASSET_INTERFACE, includeInterfaceView: true, includeCreatedEventBlob: false },
          },
        },
      },
    ]);
  });

  it('carries the any-party filter into reassignments and asks for topology events of every party', () => {
    const anyPartyFilter = { cumulative: [wildcard(true)] };

    expect(
      buildUpdateFormat({ parties: [], anyParty: true, includeCreatedEventBlob: true, includeTopologyEvents: true })
    ).toStrictEqual({
      includeTransactions: {
        eventFormat: { verbose: false, filtersByParty: {}, filtersForAnyParty: anyPartyFilter },
        transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
      },
      includeReassignments: { filtersByParty: {}, filtersForAnyParty: anyPartyFilter, verbose: false },
      includeTopologyEvents: { includeParticipantAuthorizationEvents: { parties: [] } },
    });
  });

  it('can leave reassignments out of an any-party update format', () => {
    expect(Object.keys(buildUpdateFormat({ parties: ['Alice'], anyParty: true, includeReassignments: false }))).toEqual(
      ['includeTransactions']
    );
  });
});
