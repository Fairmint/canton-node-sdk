import { testClients } from '../../../../../setup';

describe('Scan API: getDsoPartyId', () => {
  it('returns DSO party ID', async () => {
    const response = await testClients.scanApi.getDsoPartyId({});
    expect(response).toEqual({
      dso_party_id: expect.any(String),
    });
  });
});
