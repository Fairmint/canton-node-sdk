/**
 * E2E Test: Ledger JSON API - Version
 *
 * Tests the version endpoint which returns information about the Ledger JSON API version
 * and supported features.
 *
 * API: GET /v2/version
 *
 * This test demonstrates:
 * - How to query version information from the API
 * - Expected response structure and fields
 * - Feature flags that indicate API capabilities
 *
 * Prerequisites:
 * - LocalNet must be running with OAuth2 enabled
 * - Uses default localnet configuration (no env vars needed)
 */

import { createLocalnetLedgerClient, TIMEOUTS } from '../helpers';

describe('E2E: Ledger JSON API - Version', () => {
  const client = createLocalnetLedgerClient();

  describe('GET /v2/version', () => {
    it(
      'should return version information',
      async () => {
        const response = await client.getVersion();

        // Validate required fields
        expect(response).toBeDefined();
        expect(response.version).toBeDefined();
        expect(typeof response.version).toBe('string');

        // Version should follow semantic versioning pattern
        expect(response.version).toMatch(/^\d+\.\d+\.\d+/);

        console.log('✅ Version:', response.version);
      },
      TIMEOUTS.FAST,
    );

    it(
      'should include features object',
      async () => {
        const response = await client.getVersion();

        expect(response.features).toBeDefined();
        expect(typeof response.features).toBe('object');

        console.log('✅ Features:', JSON.stringify(response.features, null, 2));
      },
      TIMEOUTS.FAST,
    );

    it(
      'should indicate user management support',
      async () => {
        const response = await client.getVersion();

        // User management should be supported in localnet
        expect(response.features).toBeDefined();
        expect(response.features?.userManagement).toBeDefined();

        if (response.features?.userManagement) {
          expect(response.features.userManagement.supported).toBe(true);
          console.log(
            '✅ User management supported:',
            response.features.userManagement.supported,
          );

          // Log additional user management details if available
          console.log(
            '   Max rights per user:',
            response.features.userManagement.maxRightsPerUser,
          );
          console.log(
            '   Max users page size:',
            response.features.userManagement.maxUsersPageSize,
          );
        }
      },
      TIMEOUTS.FAST,
    );

    it(
      'should be idempotent across multiple calls',
      async () => {
        const response1 = await client.getVersion();
        const response2 = await client.getVersion();

        // Version should be consistent across calls
        expect(response1.version).toBe(response2.version);
        expect(response1.features).toEqual(response2.features);

        console.log('✅ Consistent version across multiple calls');
      },
      TIMEOUTS.FAST,
    );
  });

  describe('Response structure', () => {
    it(
      'should match expected type definition',
      async () => {
        const { version, features } = await client.getVersion();

        // Type assertion to ensure compile-time type checking works
        expect(version).toBeTruthy();
        expect(typeof version).toBe('string');

        // Features should be present and properly typed
        if (features) {
          expect(features).toBeTruthy();

          // Each feature should have a 'supported' boolean
          if (features.userManagement) {
            expect(typeof features.userManagement.supported).toBe('boolean');
          }
        }

        console.log('✅ Response structure matches type definition');
      },
      TIMEOUTS.FAST,
    );
  });
});
