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

  test('listAnsEntries returns scan-wide entries in the generated wire format', async () => {
    const client = getClient();
    const response = await client.listAnsEntries({ page_size: 20 });

    expect(Array.isArray(response.entries)).toBe(true);
    expect(response.entries.length).toBeLessThanOrEqual(20);
    for (const entry of response.entries) {
      expect(entry.user).toEqual(expect.any(String));
      expect(entry.name).toEqual(expect.any(String));
      expect(entry.url).toEqual(expect.any(String));
      expect(entry.description).toEqual(expect.any(String));
      if (entry.contract_id !== undefined) {
        expect(entry.contract_id).toEqual(expect.any(String));
      }
      if (entry.expires_at !== undefined) {
        expect(Number.isNaN(Date.parse(entry.expires_at))).toBe(false);
      }
    }
  });
});
