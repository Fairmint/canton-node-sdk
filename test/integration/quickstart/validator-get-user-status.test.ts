/**
 * Integration test for Validator API - GetUserStatus
 *
 * This test validates the canton-node-sdk against a running cn-quickstart localnet.
 * It follows the cn-quickstart approach of testing against real Canton services.
 *
 * Prerequisites:
 * - LocalNet must be running (use npm run localnet:quickstart)
 * - Environment variables must be configured (copy example.env.localnet to .env)
 *
 * This test verifies:
 * - SDK can connect to cn-quickstart localnet Validator API
 * - GetUserStatus API returns expected response structure
 * - Response contains valid user status information
 *
 * Note: CN-Quickstart uses the Validator API, not the JSON API.
 * The Validator API is exposed on ports 2903, 3903, 4903 for different participants.
 */

import { ValidatorApiClient } from '../../../src/clients/validator-api';
import { EnvLoader } from '../../../src/core/config/EnvLoader';

describe.skip('GetUserStatus Integration Test (CN-Quickstart)', () => {
  // SKIP: This test requires proper OAuth2 configuration or authentication bypass
  // CN-Quickstart uses shared-secret authentication by default, not OAuth2
  // To enable this test:
  // 1. Configure OAuth2 in cn-quickstart (enable keycloak module)
  // 2. Or modify SDK to support shared-secret authentication for localnet
  // 3. Update CANTON_LOCALNET_APP_PROVIDER_AUTH_URL accordingly
  //  
  // Example with keycloak:
  // - Run: cd /tmp/cn-quickstart/quickstart && make setup
  // - Enable OAuth2 authentication option
  // - Start: make start
  // - Update .env with correct AUTH_URL
  
  let client: ValidatorApiClient;

  beforeAll(() => {
    // Load configuration from environment
    // This uses the same configuration as the SDK
    const config = EnvLoader.getConfig('VALIDATOR_API');

    // Create client instance
    client = new ValidatorApiClient(config);
  });

  it('should successfully retrieve user status from cn-quickstart localnet', async () => {
    // Call the GetUserStatus API
    const response = await client.getUserStatus();

    // Verify response structure
    expect(response).toBeDefined();

    // Log the response for debugging
    console.log('User status response:', JSON.stringify(response, null, 2));

    // Verify the response has expected properties
    // The exact structure depends on the user's state in the system
    expect(response).toHaveProperty('party_id');
  }, 30000); // 30 second timeout for network requests

  it('should return consistent user status', async () => {
    const response1 = await client.getUserStatus();
    const response2 = await client.getUserStatus();

    // User status should be consistent between calls
    expect(response1.party_id).toEqual(response2.party_id);
  }, 30000);
});
