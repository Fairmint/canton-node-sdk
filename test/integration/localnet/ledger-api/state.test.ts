/**
 * LedgerJsonApiClient integration tests: State Queries
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / State', () => {
  test('getLedgerEnd returns ledger end offset', async () => {
    const client = getClient();
    const response = await client.getLedgerEnd({});

    expect(response).toBeDefined();
    expect(response.offset).toBeDefined();
  });
});
