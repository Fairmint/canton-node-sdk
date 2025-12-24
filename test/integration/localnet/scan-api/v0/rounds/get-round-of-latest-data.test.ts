import { testClients } from '../../../../../setup';

describe('Scan API: getRoundOfLatestData', () => {
  it('returns latest round number', async () => {
    const response = await testClients.scanApi.getRoundOfLatestData({});
    expect(response).toEqual({
      round: expect.any(Number),
    });
  });
});
