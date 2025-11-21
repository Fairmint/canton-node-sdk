import { testClients } from '../../setup';

describe('LocalNet GetUserStatus', () => {
  it('getUserStatus', async () => {
    const response = await testClients.validatorApi.getUserStatus();

    expect(response).toEqual({
      party_id: '',
      user_onboarded: false,
      user_wallet_installed: false,
      has_featured_app_right: false,
    });
  });
});
