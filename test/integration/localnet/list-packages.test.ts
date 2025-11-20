import { testClients } from '../../setup';

describe('LocalNet ListPackages', () => {
  it('listPackages', async () => {
    const response = await testClients.ledgerJsonApi.listPackages();

    // TODO: Replace with actual output from LocalNet
    // Run this test against LocalNet and copy the actual response here
    expect(response).toBeDefined();
    expect(response).toHaveProperty('packageIds');
    expect(Array.isArray(response.packageIds)).toBe(true);
  });
});
