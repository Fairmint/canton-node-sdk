import { testClients } from '../../../../../setup';

describe('Scan API: getMigrationSchedule', () => {
  it('returns migration schedule', async () => {
    const response = await testClients.scanApi.getMigrationSchedule({});
    expect(response).toHaveProperty('schedule');
  });
});
