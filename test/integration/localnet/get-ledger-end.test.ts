import { testClients } from '../../setup';

describe('LocalNet GetLedgerEnd', () => {
  it('getLedgerEnd', async () => {
    const response = await testClients.ledgerJsonApi.getLedgerEnd({});

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('offset');
    expect(typeof response.offset).toBe('number');

    // Offset should be non-negative and will increase as transactions are processed
    // In a fresh LocalNet it may be 0, in an active one it will be > 0
    expect(response.offset).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(response.offset)).toBe(true);
  });
});
