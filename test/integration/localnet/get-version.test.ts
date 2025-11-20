/**
 * LocalNet Integration Test for GetVersion API
 *
 * This test validates connectivity to a running LocalNet instance by calling the getVersion API and validating the full
 * response structure.
 *
 * Prerequisites:
 *
 * - LocalNet must be running (set up by CircleCI or manually via scripts)
 * - Environment variables must be configured (.env.localnet in CI)
 *
 * This test verifies:
 *
 * - SDK can connect to LocalNet JSON API
 * - GetVersion API returns a complete and valid response
 * - Response contains expected version string format and features structure
 */

import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { EnvLoader } from '../../../src/core/config/EnvLoader';

describe('LocalNet GetVersion Integration Test', () => {
  let client: LedgerJsonApiClient;

  beforeAll(() => {
    // Configure for LocalNet environment
    process.env['CANTON_CURRENT_NETWORK'] = 'localnet';
    process.env['CANTON_CURRENT_PROVIDER'] = 'app-provider';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_URI'] = 'http://localhost:39750';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_CLIENT_ID'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_CLIENT_SECRET'] = 'admin';
    process.env['CANTON_LOCALNET_APP_PROVIDER_AUTH_URL'] = 'http://localhost:3000/auth';
    process.env['CANTON_LOCALNET_APP_PROVIDER_PARTY_ID'] = 'test::party::123';
    process.env['CANTON_LOCALNET_APP_PROVIDER_USER_ID'] = 'test-user';

    const config = EnvLoader.getConfig('LEDGER_JSON_API');
    client = new LedgerJsonApiClient(config);
  });

  it('should successfully call getVersion and validate full response structure', async () => {
    // Call getVersion API
    const response = await client.getVersion();

    // Validate response is defined
    expect(response).toBeDefined();

    // Validate version property exists and is a non-empty string
    expect(response).toHaveProperty('version');
    expect(typeof response.version).toBe('string');
    expect(response.version.length).toBeGreaterThan(0);

    // Validate version follows semantic versioning format (e.g., "3.3.0-SNAPSHOT")
    expect(response.version).toMatch(/^\d+\.\d+\.\d+/);

    // Validate features object structure
    expect(response).toHaveProperty('features');
    expect(response.features).toBeDefined();
    expect(typeof response.features).toBe('object');

    // Validate expected feature properties exist
    // UserManagement feature should be present
    if (response.features?.userManagement) {
      expect(response.features.userManagement).toHaveProperty('supported');
      expect(typeof response.features.userManagement.supported).toBe('boolean');
      expect(response.features.userManagement).toHaveProperty('maxRightsPerUser');
      expect(response.features.userManagement).toHaveProperty('maxUsersPageSize');
    }

    // PartyManagement feature should be present
    if (response.features?.partyManagement) {
      expect(response.features.partyManagement).toHaveProperty('maxPartiesPageSize');
      expect(typeof response.features.partyManagement.maxPartiesPageSize).toBe('number');
    }

    // Experimental features should be present
    if (response.features?.experimental) {
      expect(typeof response.features.experimental).toBe('object');
    }

    // Log success for CI visibility
    console.log('✅ getVersion API call successful');
    console.log('Version:', response.version);
    console.log('Features present:', Object.keys(response.features ?? {}));
  }, 30000);
});
