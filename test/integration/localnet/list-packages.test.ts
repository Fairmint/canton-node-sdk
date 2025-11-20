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

    // Validate package ID format (should be strings)
    const firstPackageId = response.packageIds[0];
    expect(firstPackageId).toBeDefined();
    expect(typeof firstPackageId).toBe('string');
    expect(firstPackageId!.length).toBeGreaterThan(0);

    // TODO: Once LocalNet output is stable, replace with exact expected output
    // Run: tsx scripts/capture-test-output.ts
    // Then copy the actual response here for regression testing
  });
});
