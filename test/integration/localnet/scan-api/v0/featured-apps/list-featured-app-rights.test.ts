import { testClients } from '../../../../../setup';

describe('Scan API: listFeaturedAppRights', () => {
  it('returns featured app rights', async () => {
    const response = await testClients.scanApi.listFeaturedAppRights({});
    expect(response).toHaveProperty('featured_app_rights');
  });
});
