import { testClients } from '../../setup';

describe('LocalNet ListParties', () => {
  it('listParties', async () => {
    const response = await testClients.ledgerJsonApi.listParties({});

    expect(response).toHaveProperty('partyDetails');
    expect(Array.isArray(response.partyDetails)).toBe(true);
    // Each party detail should have at least an identifier
    if (response.partyDetails && response.partyDetails.length > 0) {
      expect(response.partyDetails[0]).toHaveProperty('identifier');
    }
  });
});
