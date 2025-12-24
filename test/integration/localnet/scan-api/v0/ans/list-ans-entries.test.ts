import { testClients } from '../../../../../setup';

describe('Scan API: listAnsEntries', () => {
  it('returns ANS entries', async () => {
    const response = await testClients.scanApi.listAnsEntries({ pageSize: 10 });
    expect(response).toHaveProperty('entries');
  });
});
