import { testClients } from '../../../../../setup';

describe('Scan API: getOpenAndIssuingMiningRounds', () => {
  it('returns open and issuing mining rounds', async () => {
    const response = await testClients.scanApi.getOpenAndIssuingMiningRounds({});
    expect(response).toEqual({
      open_mining_rounds: expect.any(Object),
      issuing_mining_rounds: expect.any(Object),
      amulet_rules: expect.any(Object),
    });
  });
});
