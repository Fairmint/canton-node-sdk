/**
 * ValidatorApiClient integration tests: Mining Rounds
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Mining', () => {
  test('getOpenAndIssuingMiningRounds returns mining round info', async () => {
    const client = getClient();
    const response = await client.getOpenAndIssuingMiningRounds();

    expect(response).toBeDefined();
    expect(response.open_mining_rounds).toBeDefined();
    expect(Array.isArray(response.open_mining_rounds)).toBe(true);
  });
});
