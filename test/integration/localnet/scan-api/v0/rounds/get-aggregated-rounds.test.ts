import { testClients } from '../../../../../setup';

describe('Scan API: getAggregatedRounds', () => {
  it('returns aggregated rounds data', async () => {
    const response = await testClients.scanApi.getAggregatedRounds({});
    expect(response).toHaveProperty('rounds');
  });
});
