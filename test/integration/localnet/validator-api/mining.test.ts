/**
 * ValidatorApiClient integration tests: Mining Rounds
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('ValidatorApiClient / Mining', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('getOpenAndIssuingMiningRounds returns mining round info', async () => {
    const client = getClient();
    const response = await client.getOpenAndIssuingMiningRounds();

    expect(response).toBeDefined();
    expect(response.open_mining_rounds).toBeDefined();
    expect(Array.isArray(response.open_mining_rounds)).toBe(true);
  });
});
