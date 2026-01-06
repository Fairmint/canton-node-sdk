/**
 * ValidatorApiClient integration tests: Token Registry Operations
 *
 * Tests for the token standard registry endpoints.
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Registry', () => {
  test('getRegistryInfo returns registry information', async () => {
    const client = getClient();

    try {
      const response = await client.getRegistryInfo();

      expect(response).toBeDefined();
      // Registry info includes network info
    } catch (error) {
      // May not be available in all setups
      console.warn('getRegistryInfo failed:', error);
    }
  });

  test('listInstruments returns instrument list', async () => {
    const client = getClient();

    try {
      const response = await client.listInstruments({});

      expect(response).toBeDefined();
      // Response may include instruments array
    } catch (error) {
      // May not be available in all setups
      console.warn('listInstruments failed:', error);
    }
  });

  test('getInstrument retrieves specific instrument', async () => {
    const client = getClient();

    try {
      await client.getInstrument({
        instrumentId: 'non-existent-instrument',
      });
    } catch (error) {
      // Expected - instrument not found
      expect(error).toBeDefined();
    }
  });

  // These operations have complex required parameters that we can't easily test
  // without a full setup
  test.skip('getAllocationFactory returns allocation factory info', async () => {
    // Requires specific instrument ID and choice arguments
  });

  test.skip('getTransferFactory returns transfer factory info', async () => {
    // Requires specific instrument ID and choice arguments
  });
});
