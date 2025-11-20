import { testClients } from '../../setup';

describe('LocalNet GetLedgerEnd', () => {
  it('getLedgerEnd', async () => {
    const response = await testClients.ledgerJsonApi.getLedgerEnd({});

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('offset');
    expect(typeof response.offset).toBe('number');
    expect(response.offset).toBeGreaterThanOrEqual(0);

    // TODO: Once LocalNet output is stable, replace with exact expected output
    // Run: tsx scripts/capture-test-output.ts
    // Then copy the actual response here for regression testing
  });
});
