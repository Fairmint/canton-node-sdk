import { testClients } from '../../../../setup';

describe('Scan API: isLive', () => {
  it('succeeds when service is live', async () => {
    await expect(testClients.scanApi.isLive({})).resolves.toBeUndefined();
  });
});
