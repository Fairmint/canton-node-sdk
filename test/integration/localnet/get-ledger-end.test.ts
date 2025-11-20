import { testClients } from '../../setup';

describe('LocalNet GetLedgerEnd', () => {
  it('getLedgerEnd', async () => {
    const response = await testClients.ledgerJsonApi.getLedgerEnd({});

    expect(response).toHaveProperty('offset');
    expect(response.offset).toBeDefined();
    expect(typeof response.offset).toBe('string');
  });
});
