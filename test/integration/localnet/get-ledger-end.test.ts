import { testClients } from '../../setup';

describe('LocalNet GetLedgerEnd', () => {
  it('getLedgerEnd', async () => {
    const response = await testClients.ledgerJsonApi.getLedgerEnd({});

    expect(response).toHaveProperty('offset');
    expect(typeof response.offset).toBe('number');
    expect(response.offset).toBeGreaterThanOrEqual(0);
  });
});
