/**
 * End-to-End Tests: Version API
 *
 * These tests demonstrate the happy path for the Version API endpoint.
 * They serve as both validation tests and documentation examples.
 *
 * **API Endpoint:** `GET /v2/version`
 *
 * **What it does:**
 * - Returns the version information of the participant node
 * - Includes supported features and capabilities
 *
 * **Prerequisites:**
 * - Localnet must be running (use `npm run localnet:start`)
 * - OAuth2 authentication must be configured
 *
 * **Example Usage:**
 * ```typescript
 * const client = new LedgerJsonApiClient({ network: 'localnet' });
 * const version = await client.getVersion();
 * console.log(`Canton version: ${version.version}`);
 * ```
 */

import { createTestClient } from '../helpers/test-setup';
import type { GetLedgerApiVersionResponse } from '../../../src/clients/ledger-json-api/schemas/api';

describe('Version API - End-to-End Tests', () => {
  const client = createTestClient();

  describe('getVersion()', () => {
    it('should return version information', async () => {
      const response: GetLedgerApiVersionResponse = await client.getVersion();

      // Validate response structure
      expect(response).toBeDefined();
      expect(response).toHaveProperty('version');
      expect(typeof response.version).toBe('string');

      // Version should follow semantic versioning (e.g., "3.3.0" or "3.3.0-SNAPSHOT")
      expect(response.version).toMatch(/^\d+\.\d+\.\d+/);
    }, 30000);

    it('should include features information when available', async () => {
      const response = await client.getVersion();

      // Features may or may not be present depending on Canton version
      if (response.features) {
        expect(typeof response.features).toBe('object');

        // If userManagement feature is present, validate its structure
        if (response.features.userManagement) {
          expect(response.features.userManagement).toHaveProperty('supported');
          expect(typeof response.features.userManagement.supported).toBe('boolean');
        }
      }
    }, 30000);

    it('should return consistent results across multiple calls', async () => {
      const firstCall = await client.getVersion();
      const secondCall = await client.getVersion();

      // Version should be consistent
      expect(firstCall.version).toBe(secondCall.version);

      // Features should be consistent (if present)
      if (firstCall.features && secondCall.features) {
        expect(firstCall.features).toEqual(secondCall.features);
      }
    }, 30000);
  });
});
