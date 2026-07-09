/** ValidatorApiClient integration tests: ANS Operations. */

import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

describe('ValidatorApiClient / ANS', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('listOwnedAnsEntries returns ANS entries owned by the validator user', async () => {
    const client = getClient();
    const response = await client.listOwnedAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
