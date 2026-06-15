/** ScanApiClient integration tests: Mining Round Information */

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
    // Scan API returns open_mining_rounds as an object/map (contract IDs as keys), not an array
    // This is different from the validator's scan-proxy which returns an array
    expect(typeof response.open_mining_rounds).toBe('object');
    expect(response.open_mining_rounds).not.toBeNull();
  });

  test.todo('getRoundOfLatestData was removed from the Scan API in Splice 0.6.x');
});
