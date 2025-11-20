/**
 * End-to-End Tests: Packages API
 *
 * These tests demonstrate the happy path for the Packages API endpoints.
 * They serve as both validation tests and documentation examples.
 *
 * **API Endpoints:**
 * - `GET /v2/packages` - List all packages
 * - `GET /v2/packages/{packageId}/status` - Get package status
 *
 * **What they do:**
 * - List all packages available on the participant node
 * - Get the status of a specific package
 *
 * **Prerequisites:**
 * - Localnet must be running (use `npm run localnet:start`)
 * - OAuth2 authentication must be configured
 *
 * **Example Usage:**
 * ```typescript
 * const client = new LedgerJsonApiClient({ network: 'localnet' });
 *
 * // List all packages
 * const packages = await client.listPackages();
 * console.log(`Found ${packages.packageIds.length} packages`);
 *
 * // Get status of a specific package
 * const status = await client.getPackageStatus({
 *   packageId: packages.packageIds[0]
 * });
 * console.log(`Package status: ${status.packageStatus}`);
 * ```
 */

import { createTestClient } from '../helpers/test-setup';
import type {
  ListPackagesResponse,
  GetPackageStatusResponse,
} from '../../../src/clients/ledger-json-api/schemas/api';

describe('Packages API - End-to-End Tests', () => {
  const client = createTestClient();

  describe('listPackages()', () => {
    it('should return a list of package IDs', async () => {
      const response: ListPackagesResponse = await client.listPackages();

      // Validate response structure
      expect(response).toBeDefined();
      expect(response).toHaveProperty('packageIds');
      expect(Array.isArray(response.packageIds)).toBe(true);

      // Package IDs should be non-empty strings
      response.packageIds.forEach((packageId) => {
        expect(typeof packageId).toBe('string');
        expect(packageId.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should return at least one package (standard Canton packages)', async () => {
      const response = await client.listPackages();

      // Localnet should have at least the standard Canton packages
      expect(response.packageIds.length).toBeGreaterThan(0);
    }, 30000);

    it('should return consistent results across multiple calls', async () => {
      const firstCall = await client.listPackages();
      const secondCall = await client.listPackages();

      // Package list should be consistent (same packages, possibly different order)
      expect(firstCall.packageIds.length).toBe(secondCall.packageIds.length);

      // All packages from first call should be in second call
      const secondCallSet = new Set(secondCall.packageIds);
      firstCall.packageIds.forEach((packageId) => {
        expect(secondCallSet.has(packageId)).toBe(true);
      });
    }, 30000);
  });

  describe('getPackageStatus()', () => {
    let testPackageId: string;

    beforeAll(async () => {
      // Get a package ID to use for status tests
      const packages = await client.listPackages();
      expect(packages.packageIds.length).toBeGreaterThan(0);
      testPackageId = packages.packageIds[0] as string;
    }, 30000);

    it('should return package status for a valid package ID', async () => {
      const response: GetPackageStatusResponse = await client.getPackageStatus({
        packageId: testPackageId,
      });

      // Validate response structure
      expect(response).toBeDefined();
      expect(response).toHaveProperty('packageStatus');
      expect(typeof response.packageStatus).toBe('string');
      expect(response.packageStatus.length).toBeGreaterThan(0);
    }, 30000);

    it('should return consistent status for the same package', async () => {
      const firstCall = await client.getPackageStatus({
        packageId: testPackageId,
      });
      const secondCall = await client.getPackageStatus({
        packageId: testPackageId,
      });

      // Status should be consistent for the same package
      expect(firstCall.packageStatus).toBe(secondCall.packageStatus);
    }, 30000);

    it('should return status for multiple different packages', async () => {
      const packages = await client.listPackages();

      // Test status for first few packages
      const packagesToTest = packages.packageIds.slice(0, Math.min(3, packages.packageIds.length));

      for (const packageId of packagesToTest) {
        const status = await client.getPackageStatus({ packageId });
        expect(status).toBeDefined();
        expect(status.packageStatus).toBeDefined();
        expect(typeof status.packageStatus).toBe('string');
      }
    }, 30000);
  });

  describe('Integration: List and Status', () => {
    it('should list packages and get status for each', async () => {
      // List all packages
      const packages = await client.listPackages();
      expect(packages.packageIds.length).toBeGreaterThan(0);

      // Get status for each package
      for (const packageId of packages.packageIds.slice(0, 5)) {
        // Limit to first 5 to avoid timeout
        const status = await client.getPackageStatus({ packageId });
        expect(status.packageStatus).toBeDefined();
      }
    }, 60000);
  });
});
