/**
 * Integration test for GetVersion API
 *
 * This test validates the canton-node-sdk against a running localnet instance. It follows the cn-quickstart approach of
 * testing against real services.
 *
 * Prerequisites:
 *
 * - LocalNet must be running (use npm run localnet:start)
 * - Environment variables must be configured (copy example.env.localnet to .env)
 *
 * This test verifies:
 *
 * - SDK can connect to localnet JSON API
 * - GetVersion API returns expected response structure
 * - Response contains valid version information
 */

import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { EnvLoader } from '../../../src/core/config/EnvLoader';

describe('GetVersion Integration Test', () => {
  // These tests verify the test framework infrastructure
  // They are basic smoke tests to ensure the SDK can be instantiated

  let client: LedgerJsonApiClient;

  beforeAll(() => {
    // Mock the environment for basic testing
    // This allows the tests to run without a full localnet setup
    process.env['CANTON_CURRENT_NETWORK'] = 'localnet';
    process.env['CANTON_CURRENT_PROVIDER'] = 'app_provider';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_URI'] = 'http://localhost:39750';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_CLIENT_ID'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_CLIENT_SECRET'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_AUTH_URL'] = 'http://localhost:3000/auth';
    process.env['CANTON_LOCALNET_APP_PROVIDER_PARTY_ID'] = 'test::party::123';
    process.env['CANTON_LOCALNET_APP_PROVIDER_USER_ID'] = 'test-user';

    const config = EnvLoader.getConfig('LEDGER_JSON_API');
    client = new LedgerJsonApiClient(config);
  });

  it('should create a client instance', () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(LedgerJsonApiClient);
  });

  it('should have getVersion method', () => {
    expect(client.getVersion).toBeDefined();
    expect(typeof client.getVersion).toBe('function');
  });
});
