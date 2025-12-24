import { testClients } from '../../../../../setup';

describe('Scan API: listDsoSequencers', () => {
  it('returns list of sequencers', async () => {
    const response = await testClients.scanApi.listDsoSequencers({});
    expect(response).toEqual({
      sequencers: expect.any(Object),
    });
  });
});
