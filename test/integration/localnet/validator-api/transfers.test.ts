/**
 * ValidatorApiClient integration tests: Transfer Operations
 *
 * NOTE: These tests require the user to be onboarded to the validator. In basic cn-quickstart setup, wallet endpoints
 * return 404 until onboarding completes. These tests are skipped until we add onboarding to the test setup. See:
 * tasks/2026/01/hd/2026.01.02-sdk-refactoring-and-testing.md (Backlog section)
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Transfers', () => {
  // Skip: Requires user onboarding - wallet endpoints return 404 without it
  test.skip('listTransferOffers returns transfer offers list', async () => {
    const client = getClient();
    const response = await client.listTransferOffers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.offers)).toBe(true);
  });
});
