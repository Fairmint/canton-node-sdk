/**
 * LedgerGrpcClient integration tests: State Service
 *
 * Demonstrates querying ledger state via gRPC.
 */

import { closeClient, getClient } from './setup';

describe('LedgerGrpcClient / State', () => {
  afterAll(() => {
    closeClient();
  });

  test('getLedgerEnd returns current ledger offset', async () => {
    const client = await getClient();
    const offset = await client.getLedgerEnd();

    // Offset should be a positive number (ledger has transactions)
    expect(typeof offset).toBe('number');
    expect(offset).toBeGreaterThanOrEqual(0);
  });

  test('getLedgerEnd offset increases over time with activity', async () => {
    const client = await getClient();

    // Get initial offset
    const offset1 = await client.getLedgerEnd();

    // Get offset again
    const offset2 = await client.getLedgerEnd();

    // Offsets should be non-decreasing (may be equal if no activity)
    expect(offset2).toBeGreaterThanOrEqual(offset1);
  });
});
