import { testClients } from '../../../../../setup';

describe('Scan API: listDsoScans', () => {
  it('returns list of scans', async () => {
    const response = await testClients.scanApi.listDsoScans({});
    expect(response).toEqual({
      scans: expect.any(Object),
    });
  });
});
