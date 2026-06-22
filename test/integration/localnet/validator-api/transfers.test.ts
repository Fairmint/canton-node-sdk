/** ValidatorApiClient integration tests: Transfer Operations. */

import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

describe('ValidatorApiClient / Transfers', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('listTransferOffers returns transfer offers list', async () => {
    const client = getClient();
    const response = await client.listTransferOffers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.offers)).toBe(true);
  });
});
