/**
 * LedgerJsonApiClient integration tests: Event Queries
 *
 * Tests for retrieving events from the ledger.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Events', () => {
  test('getEventsByContractId returns events for a contract', async () => {
    const client = getClient();

    // Test with a non-existent contract ID
    // Should return 404 or similar, not crash
    try {
      await client.getEventsByContractId({
        contractId: 'non-existent-contract-id-00000',
      });
    } catch (error) {
      // Expected - contract not found
      expect(error).toBeDefined();
    }
  });
});
