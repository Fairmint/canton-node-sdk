/**
 * ScanApiClient integration tests: Balance Information
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('ScanApiClient / Balance', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('getTotalAmuletBalance returns network balance', async () => {
    const client = getClient();
    const response = await client.getTotalAmuletBalance();

    expect(response).toBeDefined();
    expect(response.total_balance).toBeDefined();
  });
});
