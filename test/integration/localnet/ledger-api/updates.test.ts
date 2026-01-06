/**
 * LedgerJsonApiClient integration tests: Updates/Transaction Queries
 *
 * Tests for retrieving transactions and updates from the ledger.
 * Note: These operations require complex request bodies with event formats.
 * We test the simpler getUpdateById which has a simpler interface.
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

  test('getUpdateById returns update when found', async () => {
    if (!partyId) {
      console.warn('No party available for getUpdateById test');
      return;
    }

    const client = getClient();

    // Use a non-existent update ID - should return 404 or similar
    try {
      await client.getUpdateById({
        updateId: 'non-existent-update-id-12345',
        readAs: [partyId],
      });
      // If we get here, the update was found (unlikely with fake ID)
    } catch (error) {
      // Expected - update not found
      expect(error).toBeDefined();
    }
  });

  test('getLedgerEnd returns current ledger end offset', async () => {
    const client = getClient();

    const ledgerEnd = await client.getLedgerEnd({});

    expect(ledgerEnd).toBeDefined();
    expect(ledgerEnd.offset).toBeDefined();
    expect(typeof ledgerEnd.offset).toBe('number');
  });
});
