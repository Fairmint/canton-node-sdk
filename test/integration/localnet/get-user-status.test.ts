import { testClients } from '../../setup';

describe('LocalNet GetUserStatus', () => {
  it('getUserStatus', async () => {
    const response = await testClients.validatorApi.getUserStatus();

    expect(response).toEqual({
      party_id: expect.stringMatching(/^PAR::/),
      user_onboarded: true,
      user_wallet_installed: true,
      has_featured_app_right: false,
    });
  });
});
