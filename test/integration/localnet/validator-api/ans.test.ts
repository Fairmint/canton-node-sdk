/** ValidatorApiClient integration tests: ANS Operations. */

import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

describe('ValidatorApiClient / ANS', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('listAnsEntries returns ANS entries', async () => {
    const client = getClient();
    const response = await client.listAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });
});
