import { testClients } from '../../setup';

describe('LocalNet GetUserStatus', () => {
  it('getUserStatus', async () => {
    const response = await testClients.validatorApi.getUserStatus();

    expect(response).toEqual({
      party_id: expect.any(String),
      user_onboarded: expect.any(Boolean),
      user_wallet_installed: expect.any(Boolean),
      has_featured_app_right: expect.any(Boolean),
    });
  });
});
