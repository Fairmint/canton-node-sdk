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
});
