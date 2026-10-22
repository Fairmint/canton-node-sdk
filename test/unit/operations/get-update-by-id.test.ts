import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

const PARTY = 'validator::fingerprint';
const OTHER_PARTY = 'other::fingerprint';
const OCF_OBJECT = '#OpenCapTableApi-v01:Fairmint.OpenCapTableApi.OcfObject:OcfObject';
const WALLET_APP_INSTALL = '#splice-wallet:Splice.Wallet.Install:WalletAppInstall';
const ENDPOINT = 'https://ledger.example.test/v2/updates/update-by-id';

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
      partyId: PARTY,
    },
  },
};

function createClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

describe('LedgerJsonApiClient getUpdateById', () => {
  it('keeps the unfiltered request: a wildcard filter per party with blobs, verbose and LedgerEffects', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({ updateId: '1220abc', readAs: [PARTY, OTHER_PARTY] });

    const wildcard = {
      cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
    };
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      ENDPOINT,
      {
        updateId: '1220abc',
        updateFormat: {
          includeTransactions: {
            eventFormat: { verbose: true, filtersByParty: { [PARTY]: wildcard, [OTHER_PARTY]: wildcard } },
            transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
          },
        },
      },
      { contentType: 'application/json', includeBearerToken: true },
      expect.objectContaining({ requestSemantics: 'read' })
    );
  });

  it('lets the unfiltered request choose the shape and drop blobs', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({
      updateId: '1220abc',
      readAs: [PARTY],
      includeCreatedEventBlob: false,
      transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
    });

    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
            filtersByParty: {
              [PARTY]: {
                cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }],
              },
            },
          },
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        },
      },
    });
  });

  it('sends an interface-only request with the view on and blobs off', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({ updateId: '1220abc', readAs: [PARTY], interfaceIds: [OCF_OBJECT] });

    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
            filtersByParty: {
              [PARTY]: {
                cumulative: [
                  {
                    identifierFilter: {
                      InterfaceFilter: {
                        value: { interfaceId: OCF_OBJECT, includeInterfaceView: true, includeCreatedEventBlob: false },
                      },
                    },
                  },
                ],
              },
            },
          },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
  });

  it('combines template and interface filters with blobs and the ACS delta shape', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({
      updateId: '1220abc',
      readAs: [PARTY],
      templateIds: [WALLET_APP_INSTALL],
      interfaceIds: [OCF_OBJECT],
      includeInterfaceView: false,
      includeCreatedEventBlob: true,
      transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
    });

    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
            filtersByParty: {
              [PARTY]: {
                cumulative: [
                  {
                    identifierFilter: {
                      TemplateFilter: { value: { templateId: WALLET_APP_INSTALL, includeCreatedEventBlob: true } },
                    },
                  },
                  {
                    identifierFilter: {
                      InterfaceFilter: {
                        value: { interfaceId: OCF_OBJECT, includeInterfaceView: false, includeCreatedEventBlob: true },
                      },
                    },
                  },
                ],
              },
            },
          },
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        },
      },
    });
  });

  it('falls back to the client party list when a filtered read has no readAs parties', async () => {
    const client = createClient();
    const buildPartyList = jest.spyOn(client, 'buildPartyList').mockReturnValue(['listed-1', 'listed-2']);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({ updateId: '1220abc', readAs: [], interfaceIds: [OCF_OBJECT] });

    expect(buildPartyList).toHaveBeenCalled();
    const body = post.mock.calls[0]?.[1] as {
      updateFormat: { includeTransactions: { eventFormat: { filtersByParty: Record<string, unknown> } } };
    };
    expect(Object.keys(body.updateFormat.includeTransactions.eventFormat.filtersByParty)).toEqual([
      'listed-1',
      'listed-2',
    ]);
  });

  it('keeps an empty readAs unfiltered request empty', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({ updateId: '1220abc', readAs: [] });

    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: true, filtersByParty: {} },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
  });

  it('rejects an empty or literal-undefined updateId before any request', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await expect(client.getUpdateById({ updateId: '', readAs: [PARTY] })).rejects.toThrow();
    await expect(client.getUpdateById({ updateId: 'undefined', readAs: [PARTY] })).rejects.toThrow('Invalid updateId');
    expect(post).not.toHaveBeenCalled();
  });
});
