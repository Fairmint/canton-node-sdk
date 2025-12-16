import { testClients } from '../../../../../setup';

describe('Scan API: getAmuletRules', () => {
  it('returns amulet rules', async () => {
    const response = await testClients.scanApi.getAmuletRules({});
    expect(response).toHaveProperty('amulet_rules');
  });
});
