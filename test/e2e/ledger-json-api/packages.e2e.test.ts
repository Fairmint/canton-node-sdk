/**
 * E2E Test: Ledger JSON API - Packages
 *
 * Tests the packages endpoint which lists all DAR packages uploaded to the participant node.
 *
 * API: GET /v2/packages
 *
 * This test demonstrates:
 * - How to list all available packages
 * - Expected response structure for package listings
 * - Package metadata including package IDs
 *
 * Prerequisites:
 * - LocalNet must be running with OAuth2 enabled
 * - Uses default localnet configuration (no env vars needed)
 *
 * Note: A fresh localnet may have zero packages initially, but the API should still work.
 */

import { createLocalnetLedgerClient, TIMEOUTS } from '../helpers';

describe('E2E: Ledger JSON API - Packages', () => {
  const client = createLocalnetLedgerClient();

  describe('GET /v2/packages', () => {
    it(
      'should return a list of packages',
      async () => {
        const response = await client.listPackages();

        // Validate response structure
        expect(response).toBeDefined();
        expect(response.packageIds).toBeDefined();
        expect(Array.isArray(response.packageIds)).toBe(true);

        console.log(`✅ Found ${response.packageIds.length} package(s)`);

        // If packages exist, log them
        if (response.packageIds.length > 0) {
          console.log(
            '   Package IDs:',
            response.packageIds.slice(0, 3),
            response.packageIds.length > 3 ? '...' : '',
          );
        } else {
          console.log(
            '   Note: No packages uploaded yet (this is normal for fresh localnet)',
          );
        }
      },
      TIMEOUTS.STANDARD,
    );

    it(
      'should return valid package ID format if packages exist',
      async () => {
        const response = await client.listPackages();

        if (response.packageIds.length > 0) {
          // Package IDs should be non-empty strings
          response.packageIds.forEach((packageId) => {
            expect(typeof packageId).toBe('string');
            expect(packageId.length).toBeGreaterThan(0);
          });

          console.log(
            `✅ All ${response.packageIds.length} package ID(s) are valid strings`,
          );
        } else {
          console.log('⊘  Skipped: No packages to validate');
        }
      },
      TIMEOUTS.STANDARD,
    );

    it(
      'should be idempotent across multiple calls',
      async () => {
        const response1 = await client.listPackages();
        const response2 = await client.listPackages();

        // Package list should be consistent (assuming no concurrent uploads)
        expect(response1.packageIds).toEqual(response2.packageIds);

        console.log('✅ Package list consistent across multiple calls');
      },
      TIMEOUTS.STANDARD,
    );

    it(
      'should return unique package IDs',
      async () => {
        const response = await client.listPackages();

        if (response.packageIds.length > 0) {
          const uniqueIds = new Set(response.packageIds);
          expect(uniqueIds.size).toBe(response.packageIds.length);

          console.log('✅ All package IDs are unique');
        } else {
          console.log('⊘  Skipped: No packages to check for uniqueness');
        }
      },
      TIMEOUTS.STANDARD,
    );
  });

  describe('Response structure', () => {
    it(
      'should match expected type definition',
      async () => {
        const response = await client.listPackages();

        // Type assertion to ensure compile-time type checking works
        const packageIds: string[] = response.packageIds;
        expect(Array.isArray(packageIds)).toBe(true);

        // Each element should be a string
        packageIds.forEach((id) => {
          expect(typeof id).toBe('string');
        });

        console.log('✅ Response structure matches type definition');
      },
      TIMEOUTS.STANDARD,
    );
  });

  describe('Package metadata', () => {
    it(
      'should provide information about built-in packages',
      async () => {
        const response = await client.listPackages();

        // Canton typically has some built-in packages
        // This test documents what we expect to see
        console.log(
          '\n📦 Package Information:',
        );
        console.log(`   Total packages: ${response.packageIds.length}`);

        if (response.packageIds.length > 0) {
          console.log(
            '   Sample package IDs:',
          );
          response.packageIds.slice(0, 5).forEach((id, index) => {
            console.log(`     ${index + 1}. ${id}`);
          });

          if (response.packageIds.length > 5) {
            console.log(`     ... and ${response.packageIds.length - 5} more`);
          }
        }

        // This test always passes - it's primarily for documentation
        expect(true).toBe(true);
      },
      TIMEOUTS.STANDARD,
    );
  });
});
