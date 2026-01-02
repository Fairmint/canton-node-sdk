/**
 * LedgerJsonApiClient integration tests: Package Management
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('LedgerJsonApiClient / Packages', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('listPackages returns package list', async () => {
    const client = getClient();
    const response = await client.listPackages();

    expect(response).toBeDefined();
    expect(Array.isArray(response.packageIds)).toBe(true);
  });
});
