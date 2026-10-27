import { LedgerJsonApiClient, buildUpdateFormat } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

const ASSET_INTERFACE = '#example-package:Example.Module:Asset';

const config: ClientConfig = {
  network: 'localnet',
  authUrl: 'https://auth.example',
  apis: {
    LEDGER_JSON_API: {
      apiUrl: 'https://ledger.example.test',
      auth: {
        grantType: 'client_credentials',
        clientId: 'ledger-client',
        clientSecret: 'secret',
      },
      partyId: 'validator::fingerprint',
    },
  },
};

describe('LedgerJsonApiClient getUpdateByOffset', () => {
  it('accepts a built update format with an interface filter and posts it verbatim', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(config));
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});
    const updateFormat = buildUpdateFormat({
      parties: ['Alice'],
      interfaceIds: [ASSET_INTERFACE],
      transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
    });

    await client.getUpdateByOffset({ offset: 5, updateFormat });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/updates/update-by-offset',
      { offset: 5, updateFormat },
      { contentType: 'application/json', includeBearerToken: true },
      expect.objectContaining({ requestSemantics: 'read' })
    );
    expect(updateFormat).toEqual({
      includeTransactions: {
        eventFormat: {
          verbose: false,
          filtersByParty: {
            Alice: {
              cumulative: [
                {
                  identifierFilter: {
                    InterfaceFilter: {
                      value: {
                        interfaceId: ASSET_INTERFACE,
                        includeInterfaceView: true,
                        includeCreatedEventBlob: false,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
      },
      includeReassignments: {
        filtersByParty: {
          Alice: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: { interfaceId: ASSET_INTERFACE, includeInterfaceView: true, includeCreatedEventBlob: false },
                  },
                },
              },
            ],
          },
        },
        verbose: false,
      },
    });
  });
});
