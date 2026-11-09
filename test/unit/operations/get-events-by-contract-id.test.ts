import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

const PARTY = 'validator::fingerprint';
const ENDPOINT = 'https://ledger.example.test/v2/events/events-by-contract-id';
const WILDCARD = {
  cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
};

function createClient(partyId?: string): LedgerJsonApiClient {
  const config: ClientConfig = {
    network: 'localnet',
    authUrl: 'https://auth.example',
    apis: {
      LEDGER_JSON_API: {
        apiUrl: 'https://ledger.example.test',
        auth: { grantType: 'client_credentials', clientId: 'ledger-client', clientSecret: 'secret' },
        ...(partyId !== undefined && { partyId }),
      },
    },
  };
  return new LedgerJsonApiClient(new CantonRuntime(config));
}

describe('LedgerJsonApiClient getEventsByContractId', () => {
  it('keeps the party request: the client party plus readAs, a wildcard with blobs each', async () => {
    const client = createClient(PARTY);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getEventsByContractId({ contractId: '00abc', readAs: ['other::1'] });

    expect(post).toHaveBeenCalledWith(
      ENDPOINT,
      {
        contractId: '00abc',
        eventFormat: { verbose: true, filtersByParty: { [PARTY]: WILDCARD, 'other::1': WILDCARD } },
      },
      { contentType: 'application/json', includeBearerToken: true },
      expect.objectContaining({ requestSemantics: 'read' })
    );
  });

  it('reads as every party with anyParty, without needing a configured client party', async () => {
    const client = createClient();
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});

    await client.getEventsByContractId({ contractId: '00abc', anyParty: true });

    expect(post.mock.calls[0]?.[1]).toEqual({
      contractId: '00abc',
      eventFormat: { verbose: true, filtersByParty: {}, filtersForAnyParty: WILDCARD },
    });
  });

  it('rejects readAs together with anyParty before any request', async () => {
    const client = createClient(PARTY);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});
    const both = { contractId: '00abc', anyParty: true, readAs: [PARTY] } as unknown as Parameters<
      LedgerJsonApiClient['getEventsByContractId']
    >[0];

    await expect(client.getEventsByContractId(both)).rejects.toThrow('pass either anyParty: true or readAs, not both');
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a bad readAs at its field, as a party-list read always has', async () => {
    const client = createClient(PARTY);
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({});
    const params = { contractId: '00abc', readAs: PARTY } as unknown as Parameters<
      LedgerJsonApiClient['getEventsByContractId']
    >[0];

    await expect(client.getEventsByContractId(params)).rejects.toThrow(
      'Parameter validation failed: readAs: Invalid input: expected array, received string'
    );
    expect(post).not.toHaveBeenCalled();
  });
});
