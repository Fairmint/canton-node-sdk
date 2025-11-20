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

    // Validate party structure
    const firstParty = response.partyDetails![0];
    expect(firstParty).toBeDefined();
    expect(firstParty).toHaveProperty('party');
    expect(firstParty).toHaveProperty('isLocal');
    expect(typeof firstParty!.party).toBe('string');
    expect(typeof firstParty!.isLocal).toBe('boolean');

    // TODO: Once LocalNet output is stable, replace with exact expected output
    // Run: tsx scripts/capture-test-output.ts
    // Then copy the actual response here for regression testing
  });
});
