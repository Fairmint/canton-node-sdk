/**
 * E2E Test: LedgerJsonApi - Packages Endpoint
 *
 * Demonstrates the listPackages() API with full request/response examples.
 * This test serves as both validation and documentation.
 */

import { createLedgerClient } from './test-utils';

describe('LedgerJsonApi - listPackages()', () => {
  const client = createLedgerClient();

  it('should return list of packages', async () => {
    const result = await client.listPackages();

    // Assert the response structure
    expect(result).toHaveProperty('packageIds');
    expect(Array.isArray(result.packageIds)).toBe(true);

    // Document the structure by checking types
    if (result.packageIds.length > 0) {
      const firstPackage = result.packageIds[0];
      expect(typeof firstPackage).toBe('string');
      // Package IDs should be in the format of a hash
      expect(firstPackage.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('should return consistent package list', async () => {
    const result1 = await client.listPackages();
    const result2 = await client.listPackages();

    // Package list should be stable
    expect(result1.packageIds).toEqual(result2.packageIds);
  }, 30000);
});
