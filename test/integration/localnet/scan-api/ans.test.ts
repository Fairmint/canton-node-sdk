/**
 * ScanApiClient integration tests: ANS (Amulet Name Service) Operations
 *
 * Tests for ANS lookup operations.
 */

import { getClient } from './setup';

describe('ScanApiClient / ANS', () => {
  test('lookupAnsEntryByName returns error for non-existent name', async () => {
    const client = getClient();

    await expect(
      client.lookupAnsEntryByName({
        name: 'non-existent-name.unverified.cns',
      })
    ).rejects.toThrow();
  });

  test('lookupAnsEntryByParty returns error for non-existent party', async () => {
    const client = getClient();

    await expect(
      client.lookupAnsEntryByParty({
        party: 'non-existent-party-id',
      })
    ).rejects.toThrow();
  });

  test('listAnsEntries returns ANS entry list', async () => {
    const client = getClient();

    const response = await client.listAnsEntries({
      pageSize: 10,
    });

    expect(response).toBeDefined();
    expect(response.entries).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
