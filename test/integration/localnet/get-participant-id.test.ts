import { testClients } from '../../setup';

describe('LocalNet GetParticipantId', () => {
  it('getParticipantId', async () => {
    const response = await testClients.ledgerJsonApi.getParticipantId({});

    // Validate response structure
    expect(response).toBeDefined();
    expect(response).toHaveProperty('participantId');
    expect(typeof response.participantId).toBe('string');
    expect(response.participantId.length).toBeGreaterThan(0);

    // Participant ID should follow a pattern (though we don't enforce exact format)
    // Typically looks like: PAR::participant_name::participant_id_suffix
    expect(response.participantId).toMatch(/^[A-Za-z0-9:_-]+$/);
  });
});
