/**
 * LedgerJsonApiClient integration tests: Package Management
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Packages', () => {
  test('listPackages returns package list', async () => {
    const client = getClient();
    const response = await client.listPackages();

    expect(response).toBeDefined();
    expect(Array.isArray(response.packageIds)).toBe(true);
  });
});
