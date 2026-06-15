/**
 * ScanApiClient integration tests: Balance Information
 */

import { getClient } from './setup';

describe('ScanApiClient / Balance', () => {
  test('getInstrument returns total Amulet supply metadata', async () => {
    const client = getClient();

    const snapshot = await client.forceAcsSnapshotNow();
    const instrument = await client.getInstrument({ instrumentId: 'Amulet' });

    expect(Number.isNaN(Date.parse(snapshot.record_time))).toBe(false);
    expect(snapshot.migration_id).toBeGreaterThanOrEqual(0);
    expect(instrument.id).toBe('Amulet');
    expect(instrument.name).toBeDefined();
    expect(instrument.symbol).toBeDefined();
    expect(instrument.decimals).toBeGreaterThanOrEqual(0);
    expect(instrument.decimals).toBeLessThanOrEqual(10);

    const { totalSupply, totalSupplyAsOf } = instrument;
    if (typeof totalSupply !== 'string') {
      throw new Error('Amulet instrument did not include totalSupply');
    }
    if (typeof totalSupplyAsOf !== 'string') {
      throw new Error('Amulet instrument did not include totalSupplyAsOf');
    }

    expect(totalSupply).toMatch(/^\d+(?:\.\d+)?$/);
    expect(Number.isNaN(Date.parse(totalSupplyAsOf))).toBe(false);
  });
});
