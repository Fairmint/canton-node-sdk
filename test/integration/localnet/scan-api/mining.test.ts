/**
 * ScanApiClient integration tests: Mining Round Information
 */

import { getClient } from './setup';

describe('ScanApiClient / Mining', () => {
  test('getOpenAndIssuingMiningRounds returns mining rounds', async () => {
    const client = getClient();
    const response = await client.getOpenAndIssuingMiningRounds({
      body: {
        cached_open_mining_round_contract_ids: [],
        cached_issuing_round_contract_ids: [],
      },
    });

    expect(response).toBeDefined();
    expect(response.open_mining_rounds).toBeDefined();
    expect(Array.isArray(response.open_mining_rounds)).toBe(true);
  });

  test('getRoundOfLatestData returns latest round info', async () => {
    const client = getClient();
    const response = await client.getRoundOfLatestData();

    expect(response).toBeDefined();
    expect(response.round).toBeDefined();
  });
});
