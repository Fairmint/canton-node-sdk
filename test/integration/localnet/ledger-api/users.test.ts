/**
 * LedgerJsonApiClient integration tests: User Management
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('LedgerJsonApiClient / Users', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('listUsers returns user list', async () => {
    const client = getClient();
    const response = await client.listUsers({ pageSize: 100 });

    expect(response).toBeDefined();
    expect(Array.isArray(response.users)).toBe(true);
  });
});
