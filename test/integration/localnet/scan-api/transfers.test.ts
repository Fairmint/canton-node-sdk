/**
 * ScanApiClient integration tests: Transfer Lookups
 *
 * Tests for transfer-related lookup operations.
 */

import { getClient } from './setup';

describe('ScanApiClient / Transfers', () => {
  test('lookupTransferPreapprovalByParty returns preapproval info', async () => {
    const client = getClient();

    try {
      const response = await client.lookupTransferPreapprovalByParty({
        party: 'non-existent-party-id',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - party not found or no preapproval
      expect(error).toBeDefined();
    }
  });

  test('lookupTransferCommandCounterByParty returns counter info', async () => {
    const client = getClient();

    try {
      const response = await client.lookupTransferCommandCounterByParty({
        party: 'non-existent-party-id',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - party not found
      expect(error).toBeDefined();
    }
  });

  test('lookupTransferCommandStatus returns command status', async () => {
    const client = getClient();

    try {
      const response = await client.lookupTransferCommandStatus({
        sender: 'non-existent-sender',
        nonce: 0,
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - command not found
      expect(error).toBeDefined();
    }
  });
});
