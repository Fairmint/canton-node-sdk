/**
 * ValidatorApiClient integration tests: ANS Operations
 */

import { getClient } from './setup';

describe('ValidatorApiClient / ANS', () => {
  test('listAnsEntries returns ANS entries', async () => {
    const client = getClient();
    const response = await client.listAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
