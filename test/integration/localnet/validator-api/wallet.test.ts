/**
 * ValidatorApiClient integration tests: Wallet Operations
 *
 * NOTE: These tests require the user to be onboarded to the validator.
 * In basic cn-quickstart setup, wallet endpoints return 404 until onboarding completes.
 * These tests are skipped until we add onboarding to the test setup.
 * See: tasks/2026/01/hd/2026.01.02-sdk-refactoring-and-testing.md (Backlog section)
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Wallet', () => {
  // Skip: Requires user onboarding - wallet endpoints return 404 without it
  test.skip('getWalletBalance returns balance information', async () => {
    const client = getClient();
    const response = await client.getWalletBalance();

    expect(response).toBeDefined();
    // Balance might be 0 for new/empty wallets
    expect(response.effective_unlocked_qty).toBeDefined();
  });

  // Skip: Requires user onboarding - wallet endpoints return 404 without it
  test.skip('getUserStatus returns user status', async () => {
    const client = getClient();
    const response = await client.getUserStatus();

    expect(response).toBeDefined();
    expect(response.party_id).toBeDefined();
  });
});
