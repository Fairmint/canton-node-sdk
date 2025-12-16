import { testClients } from '../../../../../setup';

describe('Scan API: getClosedRounds', () => {
  it('returns closed rounds', async () => {
    const response = await testClients.scanApi.getClosedRounds({});
    expect(response).toHaveProperty('closed_rounds');
  });
});
