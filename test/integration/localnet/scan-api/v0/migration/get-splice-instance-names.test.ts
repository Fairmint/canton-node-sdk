import { testClients } from '../../../../../setup';

describe('Scan API: getSpliceInstanceNames', () => {
  it('returns splice instance names', async () => {
    const response = await testClients.scanApi.getSpliceInstanceNames({});
    expect(response).toEqual({
      network_name: expect.any(String),
      network_favicon_url: expect.any(String),
      amulet_name: expect.any(String),
      amulet_name_acronym: expect.any(String),
      name_service_name: expect.any(String),
      name_service_name_acronym: expect.any(String),
    });
  });
});
