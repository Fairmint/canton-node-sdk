import { testClients } from '../../../../../setup';

describe('Scan API: listAmuletPriceVotes', () => {
  it('returns amulet price votes', async () => {
    const response = await testClients.scanApi.listAmuletPriceVotes({});
    expect(response).toHaveProperty('amulet_price_votes');
  });
});
