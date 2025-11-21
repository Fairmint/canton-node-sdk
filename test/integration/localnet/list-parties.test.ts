import { testClients } from '../../setup';

describe('LocalNet ListParties', () => {
  it('listParties', async () => {
    const response = await testClients.ledgerJsonApi.listParties({});

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('partyDetails');
    expect(response).toHaveProperty('nextPageToken');
    expect(Array.isArray(response.partyDetails)).toBe(true);

    // Validate that we have some parties in LocalNet
    expect(response.partyDetails).not.toBeNull();
    expect(response.partyDetails!.length).toBeGreaterThan(0);

    // Validate party structure - all parties should have these properties
    response.partyDetails!.forEach((party) => {
      expect(party).toHaveProperty('party');
      expect(party).toHaveProperty('isLocal');
      expect(typeof party.party).toBe('string');
      expect(party.party.length).toBeGreaterThan(0);
      expect(typeof party.isLocal).toBe('boolean');
    });

    // Validate nextPageToken is a string (can be empty)
    expect(typeof response.nextPageToken).toBe('string');
  });
});
