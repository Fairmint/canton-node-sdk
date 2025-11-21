import { testClients } from '../../setup';

describe('LocalNet ListPackages', () => {
  it('listPackages', async () => {
    const response = await testClients.ledgerJsonApi.listPackages();

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('packageIds');
    expect(Array.isArray(response.packageIds)).toBe(true);

    // Validate that we have some packages in LocalNet
    expect(response.packageIds).not.toBeNull();
    expect(response.packageIds.length).toBeGreaterThan(0);

    // Validate all package IDs are non-empty strings
    response.packageIds.forEach((packageId) => {
      expect(typeof packageId).toBe('string');
      expect(packageId.length).toBeGreaterThan(0);
    });
  });
});
