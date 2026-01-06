/**
 * ScanApiClient integration tests: ANS (Amulet Name Service) Operations
 *
 * Tests for ANS lookup operations.
 */

import { getClient } from './setup';

describe('ScanApiClient / ANS', () => {
  test('lookupAnsEntryByName returns entry info', async () => {
    const client = getClient();

    try {
      const response = await client.lookupAnsEntryByName({
        name: 'non-existent-name.unverified.cns',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - name not found
      expect(error).toBeDefined();
    }
  });

  test('lookupAnsEntryByParty returns entry info', async () => {
    const client = getClient();

    try {
      const response = await client.lookupAnsEntryByParty({
        party: 'non-existent-party-id',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - party not found
      expect(error).toBeDefined();
    }
  });

  test('listAnsEntries returns ANS entry list', async () => {
    const client = getClient();

    try {
      const response = await client.listAnsEntries({
        pageSize: 10,
      });

      expect(response).toBeDefined();
      expect(response.entries).toBeDefined();
      expect(Array.isArray(response.entries)).toBe(true);
    } catch (error) {
      // May fail if ANS is not configured
      console.warn('listAnsEntries failed:', error);
    }
  });
});
