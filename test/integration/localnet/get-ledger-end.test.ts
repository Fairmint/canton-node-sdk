import { testClients } from '../../setup';

describe('LocalNet GetLedgerEnd', () => {
  it('getLedgerEnd', async () => {
    const response = await testClients.ledgerJsonApi.getLedgerEnd({});

    expect(response).toEqual({
      offset: expect.any(Number),
    });
  });
});

