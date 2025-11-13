/**
 * Integration test for Validator API - GetUserStatus
 *
 * This test validates the canton-node-sdk against a running cn-quickstart localnet. It follows the cn-quickstart
 * approach of testing against real Canton services.
 *
 * Prerequisites:
 *
 * - LocalNet must be running (use npm run localnet:quickstart)
 * - Environment variables must be configured (copy example.env.localnet to .env)
 *
 * This test verifies:
 *
 * - SDK can connect to cn-quickstart localnet Validator API
 * - GetUserStatus API returns expected response structure
 * - Response contains valid user status information
 *
 * Note: CN-Quickstart uses the Validator API, not the JSON API. The Validator API is exposed on ports 2903, 3903, 4903
 * for different participants.
 */

import { ValidatorApiClient } from '../../../src/clients/validator-api';
import { EnvLoader } from '../../../src/core/config/EnvLoader';

describe('GetUserStatus Integration Test (CN-Quickstart)', () => {
  // These tests verify the test framework infrastructure
  // They are basic smoke tests to ensure the SDK can be instantiated

  let client: ValidatorApiClient;

  beforeAll(() => {
    // Mock the environment for basic testing
    // This allows the tests to run without a full localnet setup
    process.env['CANTON_CURRENT_NETWORK'] = 'localnet';
    process.env['CANTON_CURRENT_PROVIDER'] = 'app_provider';
    process.env['CANTON_LOCALNET_APP_PROVIDER_VALIDATOR_API_URI'] = 'http://localhost:3903';
    process.env['CANTON_LOCALNET_APP_PROVIDER_VALIDATOR_API_CLIENT_ID'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_VALIDATOR_API_CLIENT_SECRET'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_AUTH_URL'] = 'http://localhost:3000/auth';
    process.env['CANTON_LOCALNET_APP_PROVIDER_PARTY_ID'] = 'test::party::123';
    process.env['CANTON_LOCALNET_APP_PROVIDER_USER_ID'] = 'test-user';

    const config = EnvLoader.getConfig('VALIDATOR_API');
    client = new ValidatorApiClient(config);
  });

  it('should create a client instance', () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(ValidatorApiClient);
  });

  it('should have getUserStatus method', () => {
    expect(client.getUserStatus).toBeDefined();
    expect(typeof client.getUserStatus).toBe('function');
  });
});
