import {
  buildCantonRuntimeCredentialClientConfig,
  buildCantonRuntimeCredentialEnvKeys,
  buildCantonRuntimeCredentialEnvMap,
  normalizeCantonRuntimeCredentials,
  type CantonRuntimeCredentialsInput,
} from '../../../src/core/config/CantonRuntimeCredentials';
import { ConfigurationError } from '../../../src/core/errors';

const rawCredentials: CantonRuntimeCredentialsInput = {
  partyId: ' transfer-agent::party ',
  userId: ' transfer-agent-user ',
  validatorAdminToken: ' validator-admin-token ',
  validatorJsonApiEndpoint: ' https://validator.example/api/validator/ ',
  ledgerJsonApiEndpoint: ' https://ledger.example/ ',
  spliceScanApiEndpoint: ' https://scan.example/api/scan/// ',
};

const normalizedCredentials = {
  partyId: 'transfer-agent::party',
  userId: 'transfer-agent-user',
  validatorAdminToken: 'validator-admin-token',
  validatorJsonApiEndpoint: 'https://validator.example/api/validator',
  ledgerJsonApiEndpoint: 'https://ledger.example',
  spliceScanApiEndpoint: 'https://scan.example/api/scan',
};

describe('Canton runtime credential helpers', () => {
  it('normalizes required strings and endpoint URLs', () => {
    expect(normalizeCantonRuntimeCredentials(rawCredentials)).toEqual(normalizedCredentials);
  });

  it('emits stable env keys for a network/provider prefix', () => {
    expect(
      buildCantonRuntimeCredentialEnvKeys({
        network: 'localnet',
        provider: 'app-provider',
      })
    ).toEqual([
      'CANTON_LOCALNET_APP-PROVIDER_PARTY_ID',
      'CANTON_LOCALNET_APP-PROVIDER_USER_ID',
      'CANTON_LOCALNET_APP-PROVIDER_VALIDATOR_ADMIN_TOKEN',
      'CANTON_LOCALNET_APP-PROVIDER_VALIDATOR_JSON_API_ENDPOINT',
      'CANTON_LOCALNET_APP-PROVIDER_LEDGER_JSON_API_ENDPOINT',
      'CANTON_LOCALNET_APP-PROVIDER_SPLICE_SCAN_API_ENDPOINT',
    ]);
  });

  it('builds an env map without mutating process.env', () => {
    const envKey = 'CANTON_DEVNET_5N_PARTY_ID';
    const previousValue = process.env[envKey];
    delete process.env[envKey];

    try {
      const envMap = buildCantonRuntimeCredentialEnvMap({
        network: 'devnet',
        provider: '5n',
        credentials: rawCredentials,
      });

      expect(envMap).toEqual({
        CANTON_DEVNET_5N_PARTY_ID: normalizedCredentials.partyId,
        CANTON_DEVNET_5N_USER_ID: normalizedCredentials.userId,
        CANTON_DEVNET_5N_VALIDATOR_ADMIN_TOKEN: normalizedCredentials.validatorAdminToken,
        CANTON_DEVNET_5N_VALIDATOR_JSON_API_ENDPOINT: normalizedCredentials.validatorJsonApiEndpoint,
        CANTON_DEVNET_5N_LEDGER_JSON_API_ENDPOINT: normalizedCredentials.ledgerJsonApiEndpoint,
        CANTON_DEVNET_5N_SPLICE_SCAN_API_ENDPOINT: normalizedCredentials.spliceScanApiEndpoint,
      });
      expect(process.env[envKey]).toBeUndefined();
    } finally {
      if (previousValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = previousValue;
      }
    }
  });

  it('builds an explicit client config for SDK runtimes', () => {
    expect(
      buildCantonRuntimeCredentialClientConfig({
        network: 'devnet',
        provider: '5n',
        credentials: rawCredentials,
      })
    ).toEqual({
      network: 'devnet',
      provider: '5n',
      partyId: normalizedCredentials.partyId,
      userId: normalizedCredentials.userId,
      apis: {
        LEDGER_JSON_API: {
          apiUrl: normalizedCredentials.ledgerJsonApiEndpoint,
          auth: {
            grantType: 'client_credentials',
            clientId: '',
            bearerToken: normalizedCredentials.validatorAdminToken,
          },
          partyId: normalizedCredentials.partyId,
          userId: normalizedCredentials.userId,
        },
        VALIDATOR_API: {
          apiUrl: normalizedCredentials.validatorJsonApiEndpoint,
          auth: {
            grantType: 'client_credentials',
            clientId: '',
            bearerToken: normalizedCredentials.validatorAdminToken,
          },
          partyId: normalizedCredentials.partyId,
          userId: normalizedCredentials.userId,
        },
        SCAN_API: {
          apiUrl: normalizedCredentials.spliceScanApiEndpoint,
          auth: {
            grantType: 'client_credentials',
            clientId: '',
          },
          partyId: normalizedCredentials.partyId,
          userId: normalizedCredentials.userId,
        },
      },
    });
  });

  it('rejects missing values and invalid endpoints', () => {
    expect(() =>
      normalizeCantonRuntimeCredentials({
        ...rawCredentials,
        partyId: ' ',
      })
    ).toThrow(ConfigurationError);

    expect(() =>
      normalizeCantonRuntimeCredentials({
        ...rawCredentials,
        ledgerJsonApiEndpoint: 'ftp://ledger.example',
      })
    ).toThrow('expected an http(s) URL');
  });

  it('rejects env prefixes that cannot form portable env var names', () => {
    expect(() =>
      buildCantonRuntimeCredentialEnvMap({
        network: 'devnet',
        provider: 'app provider',
        credentials: rawCredentials,
      })
    ).toThrow('expected only letters, numbers, underscores, and hyphens');
  });
});
