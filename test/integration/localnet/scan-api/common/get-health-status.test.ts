import { testClients } from '../../../../setup';

describe('Scan API: getHealthStatus', () => {
  it('returns health status', async () => {
    const response = await testClients.scanApi.getHealthStatus({});
    expect(response).toEqual({
      status: expect.any(String),
    });
  });
});
