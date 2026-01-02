/**
 * ScanApiClient integration tests: Balance Information
 */

import { getClient } from './setup';

describe('ScanApiClient / Balance', () => {
  test('getTotalAmuletBalance returns network balance', async () => {
    const client = getClient();
    const response = await client.getTotalAmuletBalance();

    expect(response).toBeDefined();
    expect(response.total_balance).toBeDefined();
  });
});
