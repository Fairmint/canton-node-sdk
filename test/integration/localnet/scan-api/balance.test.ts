/**
 * ScanApiClient integration tests: Balance Information
 */

import { getClient } from './setup';

describe('ScanApiClient / Balance', () => {
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
      expect(Number.isNaN(Date.parse(totalSupplyAsOf))).toBe(false);
    }
  });
});
