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

describe.skip('GetVersion Integration Test', () => {
  // SKIP: This test requires proper OAuth2 configuration or authentication bypass
  // CN-Quickstart uses shared-secret authentication by default, not OAuth2
  // To enable this test:
  // 1. Configure OAuth2 in cn-quickstart (enable keycloak module)
  // 2. Or modify SDK to support shared-secret authentication for localnet
  // 3. Update CANTON_LOCALNET_APP_PROVIDER_AUTH_URL accordingly

  let client: LedgerJsonApiClient;

  beforeAll(() => {
    // Load configuration from environment
    // This uses the same configuration as the SDK
    const config = EnvLoader.getConfig('LEDGER_JSON_API');

    // Create client instance
    client = new LedgerJsonApiClient(config);
  });

  it('should successfully retrieve version information from localnet', async () => {
    // Call the GetVersion API
    const response = await client.getVersion();

    // Verify response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('features');

    // Log the response for debugging
    console.log('Version response:', JSON.stringify(response, null, 2));

    // Verify features exist
    expect(response.features).toBeDefined();
    expect(typeof response.features).toBe('object');
  }, 30000); // 30 second timeout for network requests

  it('should return version info with proper structure', async () => {
    const response = await client.getVersion();

    // Check that features is an object (can be empty or have properties)
    expect(response.features).toBeDefined();
    expect(typeof response.features).toBe('object');

    // The response should be consistent
    const response2 = await client.getVersion();
    expect(response2).toEqual(response);
  }, 30000);
});
