/**
 * LedgerJsonApiClient integration tests: State Queries
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('LedgerJsonApiClient / State', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('getLedgerEnd returns ledger end offset', async () => {
    const client = getClient();
    const response = await client.getLedgerEnd({});

    expect(response).toBeDefined();
    expect(response.offset).toBeDefined();
  });
});
