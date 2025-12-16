import { testClients } from '../../../../../setup';

describe('Scan API: getAnsRules', () => {
  it('returns ANS rules', async () => {
    const response = await testClients.scanApi.getAnsRules({});
    expect(response).toHaveProperty('ans_rules');
  });
});
