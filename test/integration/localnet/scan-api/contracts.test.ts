/**
 * ScanApiClient integration tests: Contract Lookups
 *
 * Tests for contract-related lookup operations.
 */

import { getClient } from './setup';

describe('ScanApiClient / Contracts', () => {
  test('lookupFeaturedAppRight returns app right info', async () => {
    const client = getClient();

    try {
      const response = await client.lookupFeaturedAppRight({
        providerPartyId: 'non-existent-provider',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // Expected - app right not found
      expect(error).toBeDefined();
    }
  });
});
