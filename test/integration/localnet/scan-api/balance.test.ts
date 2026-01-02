/**
 * ScanApiClient integration tests: Balance Information
 *
 * NOTE: Some balance endpoints may not be available in basic cn-quickstart setup.
 * These tests are skipped until we confirm endpoint availability.
 * See: tasks/2026/01/hd/2026.01.02-sdk-refactoring-and-testing.md (Backlog section)
 */

import { getClient } from './setup';

describe('ScanApiClient / Balance', () => {
  // Skip: This endpoint may not be available in cn-quickstart
  test.skip('getTotalAmuletBalance returns network balance', async () => {
    const client = getClient();
    const response = await client.getTotalAmuletBalance();

    expect(response).toBeDefined();
    expect(response.total_balance).toBeDefined();
  });
});
