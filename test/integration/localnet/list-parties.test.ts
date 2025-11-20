import { testClients } from '../../setup';

describe('LocalNet ListParties', () => {
  it('listParties', async () => {
    const response = await testClients.ledgerJsonApi.listParties({});

    // TODO: Replace with actual output from LocalNet
    // Run this test against LocalNet and copy the actual response here
    expect(response).toBeDefined();
    expect(response).toHaveProperty('partyDetails');
    expect(Array.isArray(response.partyDetails)).toBe(true);
  });
});
