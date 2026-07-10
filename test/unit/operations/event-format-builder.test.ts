import { buildEventFormat } from '../../../src/clients/ledger-json-api/operations/v2/utils/event-format-builder';

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
