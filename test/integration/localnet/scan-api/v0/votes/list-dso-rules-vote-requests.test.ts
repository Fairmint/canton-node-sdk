import { testClients } from '../../../../../setup';

describe('Scan API: listDsoRulesVoteRequests', () => {
  it('returns vote requests', async () => {
    const response = await testClients.scanApi.listDsoRulesVoteRequests({});
    expect(response).toHaveProperty('dso_rules_vote_requests');
  });
});
