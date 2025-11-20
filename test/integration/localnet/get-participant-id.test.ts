import { testClients } from '../../setup';

describe('LocalNet GetParticipantId', () => {
  it('getParticipantId', async () => {
    const response = await testClients.ledgerJsonApi.getParticipantId({});

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('participantId');
    expect(typeof response.participantId).toBe('string');
    expect(response.participantId.length).toBeGreaterThan(0);

    // TODO: Once LocalNet output is stable, replace with exact expected output
    // Run: tsx scripts/capture-test-output.ts
    // Then copy the actual response here for regression testing
  });
});
