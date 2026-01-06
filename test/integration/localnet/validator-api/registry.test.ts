/**
 * ValidatorApiClient integration tests: Token Registry Operations
 *
 * Tests for the token standard registry endpoints.
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Registry', () => {
  test('getRegistryInfo returns registry information', async () => {
    const client = getClient();

    const response = await client.getRegistryInfo();

    expect(response).toBeDefined();
  });

  test('listInstruments returns instrument list', async () => {
    const client = getClient();

    const response = await client.listInstruments({});

    expect(response).toBeDefined();
  });

  test('getInstrument returns error for non-existent instrument', async () => {
    const client = getClient();

    await expect(
      client.getInstrument({
        instrumentId: 'non-existent-instrument',
      })
    ).rejects.toThrow();
  });
});
