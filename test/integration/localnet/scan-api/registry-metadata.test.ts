/** ScanApiClient integration tests: token registry metadata. */

import { getClient } from './setup';

describe('ScanApiClient / Registry metadata', () => {
  test('getRegistryInfo returns the LocalNet registry contract', async () => {
    const client = getClient();

    const registry = await client.getRegistryInfo();

    expect(registry.adminId).toEqual(expect.any(String));
    expect(registry.adminId).not.toHaveLength(0);
    expect(registry.supportedApis).toMatchObject({
      'splice-api-token-metadata-v1': 1,
    });
    for (const minorVersion of Object.values(registry.supportedApis)) {
      expect(Number.isInteger(minorVersion)).toBe(true);
    }
  });

  test('listInstruments returns normalized LocalNet instrument metadata', async () => {
    const client = getClient();

    const response = await client.listInstruments({ pageSize: 25 });
    const instrument = response.instruments.find(({ id }) => id === 'Amulet');

    expect(instrument).toBeDefined();
    if (instrument === undefined) {
      throw new Error('LocalNet registry did not expose the Amulet instrument');
    }
    expect(instrument).toMatchObject({
      id: 'Amulet',
      name: expect.any(String),
      symbol: expect.any(String),
      decimals: 10,
      supportedApis: expect.objectContaining({
        'splice-api-token-metadata-v1': 1,
        'splice-api-token-holding-v1': 1,
        'splice-api-token-transfer-instruction-v1': 1,
      }),
    });
    expect(response.nextPageToken).toBeUndefined();
    if (instrument.totalSupply === undefined) {
      expect(instrument).not.toHaveProperty('totalSupply');
    } else {
      expect(instrument.totalSupply).toEqual(expect.any(String));
    }
    if (instrument.totalSupplyAsOf === undefined) {
      expect(instrument).not.toHaveProperty('totalSupplyAsOf');
    } else {
      expect(Number.isNaN(Date.parse(instrument.totalSupplyAsOf))).toBe(false);
    }
  });

  test('getInstrument returns Amulet metadata', async () => {
    const client = getClient();

    const instrument = await client.getInstrument({ instrumentId: 'Amulet' });

    expect(instrument.id).toBe('Amulet');
    expect(instrument.name).toBeDefined();
    expect(instrument.symbol).toBeDefined();
    expect(instrument.decimals).toBeGreaterThanOrEqual(0);
    expect(instrument.decimals).toBeLessThanOrEqual(10);
    expect(instrument.supportedApis).toMatchObject({
      'splice-api-token-metadata-v1': 1,
      'splice-api-token-holding-v1': 1,
      'splice-api-token-transfer-instruction-v1': 1,
    });

    const { totalSupply, totalSupplyAsOf } = instrument;
    if (totalSupply !== undefined) {
      expect(totalSupply).toMatch(/^\d+(?:\.\d+)?$/);
    }
    if (totalSupplyAsOf !== undefined) {
      expect(Date.parse(totalSupplyAsOf)).not.toBeNaN();
    }
  });
});
