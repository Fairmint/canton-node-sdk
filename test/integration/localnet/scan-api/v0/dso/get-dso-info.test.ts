import { testClients } from '../../../../../setup';

describe('Scan API: getDsoInfo', () => {
  it('returns DSO information', async () => {
    const response = await testClients.scanApi.getDsoInfo({});
    expect(response).toEqual({
      sv_user: expect.any(String),
      sv_party_id: expect.any(String),
      dso_party_id: expect.any(String),
      voting_threshold: expect.any(Number),
      latest_open_mining_round: expect.any(Object),
      amulet_rules: expect.any(Object),
      sv_node_states: expect.any(Object),
    });
  });
});
