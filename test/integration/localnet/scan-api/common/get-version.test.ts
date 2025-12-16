import { testClients } from '../../../../setup';

describe('Scan API: getVersion', () => {
  it('returns version info', async () => {
    const response = await testClients.scanApi.getVersion({});
    expect(response).toEqual({
      version: expect.any(String),
    });
  });
});
