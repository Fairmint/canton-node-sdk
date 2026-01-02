/**
 * ValidatorApiClient integration tests: ANS Operations
 *
 * NOTE: These tests require the user to be onboarded to the validator.
 * In basic cn-quickstart setup, ANS entry endpoint returns 404 until onboarding completes.
 * These tests are skipped until we add onboarding to the test setup.
 * See: tasks/2026/01/hd/2026.01.02-sdk-refactoring-and-testing.md (Backlog section)
 */

import { getClient } from './setup';

describe('ValidatorApiClient / ANS', () => {
  // Skip: Requires user onboarding - entry endpoint returns 404 without it
  test.skip('listAnsEntries returns ANS entries', async () => {
    const client = getClient();
    const response = await client.listAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
