import { testClients } from '../../setup';

describe('LocalNet GetUserStatus', () => {
  it('getUserStatus returns user status from localnet', async () => {
    const response = await testClients.validatorApi.getUserStatus();

    // Validate response structure
    expect(response).toHaveProperty('party_id');
    expect(response).toHaveProperty('user_onboarded');
    expect(response).toHaveProperty('user_wallet_installed');
    expect(response).toHaveProperty('has_featured_app_right');

    // Validate types
    expect(typeof response.party_id).toBe('string');
    expect(typeof response.user_onboarded).toBe('boolean');
    expect(typeof response.user_wallet_installed).toBe('boolean');
    expect(typeof response.has_featured_app_right).toBe('boolean');
  });
});
