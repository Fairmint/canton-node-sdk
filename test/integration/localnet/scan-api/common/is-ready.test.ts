import { testClients } from '../../../../setup';

describe('Scan API: isReady', () => {
  it('succeeds when service is ready', async () => {
    await expect(testClients.scanApi.isReady({})).resolves.toBeUndefined();
  });
});
