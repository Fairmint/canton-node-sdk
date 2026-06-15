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

    type LocalNetInstrument = Omit<typeof instrument, 'totalSupply' | 'totalSupplyAsOf'> & {
      totalSupply?: string | null;
      totalSupplyAsOf?: string | null;
    };
    const { totalSupply, totalSupplyAsOf } = instrument as LocalNetInstrument;
    if (typeof totalSupply === 'string') {
      expect(totalSupply).toMatch(/^\d+(?:\.\d+)?$/);
    } else {
      expect(totalSupply == null).toBe(true);
    }
    if (typeof totalSupplyAsOf === 'string') {
      expect(Number.isNaN(Date.parse(totalSupplyAsOf))).toBe(false);
    } else {
      expect(totalSupplyAsOf == null).toBe(true);
    }
  });
});
