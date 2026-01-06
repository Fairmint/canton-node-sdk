/**
 * LedgerJsonApiClient integration tests: Command Submission
 *
 * Tests for submitting commands to the ledger.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Commands', () => {
  test('listPackages returns available packages', async () => {
    const client = getClient();

    const packages = await client.listPackages();

    expect(packages.packageIds).toBeDefined();
    expect(Array.isArray(packages.packageIds)).toBe(true);
  });
});
