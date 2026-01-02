/**
 * ValidatorApiClient integration tests: ANS Operations
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('ValidatorApiClient / ANS', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('listAnsEntries returns ANS entries', async () => {
    const client = getClient();
    const response = await client.listAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
