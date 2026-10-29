import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

const PARTY = 'validator::fingerprint';
const OTHER_PARTY = 'other::fingerprint';
const ASSET_INTERFACE = '#example-package:Example.Module:Asset';
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

    await client.getUpdateById({ updateId: '1220abc', readAs: [PARTY], interfaceIds: [ASSET_INTERFACE] });

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
      interfaceIds: [ASSET_INTERFACE],
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
                        value: {
                          interfaceId: ASSET_INTERFACE,
                          includeInterfaceView: false,
                          includeCreatedEventBlob: true,
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
      },
    });
  });

  it('falls back to the client party list when a filtered read has no readAs parties', async () => {
    const client = createClient();
    const buildPartyList = jest.spyOn(client, 'buildPartyList').mockReturnValue(['listed-1', 'listed-2']);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getUpdateById({ updateId: '1220abc', readAs: [], interfaceIds: [ASSET_INTERFACE] });

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

describe('LedgerJsonApiClient getUpdateById any party', () => {
  const wildcard = {
    cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
  };

  it('adds a wildcard filtersForAnyParty to an unfiltered read, with or without readAs parties', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});
    const buildPartyList = jest.spyOn(client, 'buildPartyList');

    await client.getUpdateById({ updateId: '1220abc', readAs: [], anyParty: true });
    await client.getUpdateById({ updateId: '1220abc', readAs: [PARTY], anyParty: true });

    expect(buildPartyList).not.toHaveBeenCalled();
    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: true, filtersByParty: {}, filtersForAnyParty: wildcard },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
    expect(post.mock.calls[1]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: { verbose: true, filtersByParty: { [PARTY]: wildcard }, filtersForAnyParty: wildcard },
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
  });

  it('puts a filtered read into filtersForAnyParty without falling back to the client party list', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});
    const buildPartyList = jest.spyOn(client, 'buildPartyList');

    await client.getUpdateById({ updateId: '1220abc', readAs: [], anyParty: true, interfaceIds: [ASSET_INTERFACE] });

    expect(buildPartyList).not.toHaveBeenCalled();
    expect(post.mock.calls[0]?.[1]).toEqual({
      updateId: '1220abc',
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
            filtersByParty: {},
            filtersForAnyParty: {
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
          transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
        },
      },
    });
  });
});

describe('LedgerJsonApiClient getEventsByContractId', () => {
  const ENDPOINT_EVENTS = 'https://ledger.example.test/v2/events/events-by-contract-id';
  const wildcard = {
    cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
  };

  it('keeps reading as the client party plus readAs by default', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getEventsByContractId({ contractId: '00cid', readAs: [OTHER_PARTY] });

    expect(post).toHaveBeenCalledWith(
      ENDPOINT_EVENTS,
      {
        contractId: '00cid',
        eventFormat: { verbose: true, filtersByParty: { [PARTY]: wildcard, [OTHER_PARTY]: wildcard } },
      },
      { contentType: 'application/json', includeBearerToken: true },
      expect.objectContaining({ requestSemantics: 'read' })
    );
  });

  it('reads as any party plus only the readAs parties with anyParty', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getEventsByContractId({ contractId: '00cid', anyParty: true });
    await client.getEventsByContractId({ contractId: '00cid', readAs: [OTHER_PARTY], anyParty: true });

    expect(post.mock.calls[0]?.[1]).toEqual({
      contractId: '00cid',
      eventFormat: { verbose: true, filtersByParty: {}, filtersForAnyParty: wildcard },
    });
    expect(post.mock.calls[1]?.[1]).toEqual({
      contractId: '00cid',
      eventFormat: { verbose: true, filtersByParty: { [OTHER_PARTY]: wildcard }, filtersForAnyParty: wildcard },
    });
  });
});
