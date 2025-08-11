import { ClientConfig } from '../../src/core/types';

export const mockClientConfig: ClientConfig = {
  network: 'testnet',
  provider: 'test-provider',
  authUrl: 'https://auth.test.com',
  partyId: 'test-party-id',
  userId: 'test-user-id',
  managedParties: ['test-party-1', 'test-party-2'],
  apis: {
    LEDGER_JSON_API: {
      apiUrl: 'https://ledger-api.test.com',
      auth: {
        grantType: 'client_credentials',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
      partyId: 'test-party-id',
      userId: 'test-user-id',
    },
    VALIDATOR_API: {
      apiUrl: 'https://validator-api.test.com',
      auth: {
        grantType: 'client_credentials',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
      partyId: 'test-party-id',
      userId: 'test-user-id',
    },
    LIGHTHOUSE_API: {
      apiUrl: 'https://lighthouse-api.test.com',
    },
  },
};

export const mockApiUrls = {
  LEDGER_JSON_API: 'https://ledger-api.test.com',
  VALIDATOR_API: 'https://validator-api.test.com',
  LIGHTHOUSE_API: 'https://lighthouse-api.test.com',
};
