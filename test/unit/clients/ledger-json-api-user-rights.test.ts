import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { CantonRuntime, type ClientConfig } from '../../../src/core';

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
    },
  },
};

describe('LedgerJsonApiClient user rights', () => {
  it('sends the path user ID in both grant and revoke request bodies', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(config));
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({ newlyGrantedRights: [] });
    const patch = jest.spyOn(client, 'makePatchRequest').mockResolvedValue({ newlyRevokedRights: [] });
    const userId = 'user-id';
    const rights = [{ kind: { CanReadAsAnyParty: { value: {} } } }];
    const expectedBody = { userId, rights, identityProviderId: '' };
    const expectedConfig = { contentType: 'application/json', includeBearerToken: true };

    await client.grantUserRights({ userId, rights });
    await client.revokeUserRights({ userId, rights });

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/user-id/rights',
      expectedBody,
      expectedConfig
    );
    expect(patch).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/user-id/rights',
      expectedBody,
      expectedConfig
    );
  });

  it('encodes the user ID path segment (a "#" is allowed) and keeps it as given in the body', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(config));
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({ newlyGrantedRights: [] });
    const get = jest.spyOn(client, 'makeGetRequest').mockResolvedValue({ rights: [] });
    const userId = 'wallet#server';
    const rights = [{ kind: { CanActAs: { value: { party: 'party::1220aa' } } } }];

    await client.grantUserRights({ userId, rights });
    await client.listUserRights({ userId });

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/wallet%23server/rights',
      { userId, rights, identityProviderId: '' },
      expect.anything()
    );
    expect(get).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/wallet%23server/rights?identity-provider-id=',
      expect.anything()
    );
  });

  it('sends the given identityProviderId when granting and listing rights', async () => {
    const client = new LedgerJsonApiClient(new CantonRuntime(config));
    const post = jest.spyOn(client, 'makePostRequest').mockResolvedValue({ newlyGrantedRights: [] });
    const get = jest.spyOn(client, 'makeGetRequest').mockResolvedValue({ rights: [] });
    const rights = [{ kind: { CanActAs: { value: { party: 'party::1220aa' } } } }];

    await client.grantUserRights({ userId: 'u-1', identityProviderId: 'idp-wallets', rights });
    await client.listUserRights({ userId: 'u-1', identityProviderId: 'idp-wallets' });

    expect(post).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/u-1/rights',
      { userId: 'u-1', rights, identityProviderId: 'idp-wallets' },
      expect.anything()
    );
    expect(get).toHaveBeenCalledWith(
      'https://ledger.example.test/v2/users/u-1/rights?identity-provider-id=idp-wallets',
      expect.anything()
    );
  });
});
