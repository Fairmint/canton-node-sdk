/**
 * LedgerJsonApiClient integration tests: Updates/Transaction Queries
 *
 * Tests for retrieving transactions and updates from the ledger.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Updates', () => {
  let partyId: string;

  beforeAll(async () => {
    const client = getClient();
    const parties = await client.listParties({});
    const partyDetails = parties.partyDetails ?? [];
    if (partyDetails.length > 0 && partyDetails[0]) {
      partyId = partyDetails[0].party;
    }
  });

  test('getUpdateById returns error for non-existent update', async () => {
    expect(partyId).toBeDefined();

    const client = getClient();

    await expect(
      client.getUpdateById({
        updateId: 'non-existent-update-id-12345',
        readAs: [partyId],
      })
    ).rejects.toThrow();
  });

  test('getLedgerEnd returns current ledger end offset', async () => {
    const client = getClient();

    const ledgerEnd = await client.getLedgerEnd({});

    expect(ledgerEnd).toBeDefined();
    expect(ledgerEnd.offset).toBeDefined();
    expect(typeof ledgerEnd.offset).toBe('number');
  });
});
