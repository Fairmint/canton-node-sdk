/** ValidatorApiClient integration tests: Wallet Operations. */

import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

describe('ValidatorApiClient / Wallet', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('getWalletBalance returns balance information', async () => {
    const client = getClient();
    const response = await client.getWalletBalance();

    expect(response).toBeDefined();
    // Balance might be 0 for new/empty wallets
    expect(response.effective_unlocked_qty).toBeDefined();
  });

  test('getUserStatus returns user status', async () => {
    const client = getClient();
    const response = await client.getUserStatus();

    expect(response).toBeDefined();
    expect(response.party_id).toBeDefined();
  });
});
