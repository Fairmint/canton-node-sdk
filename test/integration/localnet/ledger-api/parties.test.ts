/**
 * LedgerJsonApiClient integration tests: Party Management
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Parties', () => {
  test('listParties returns party list', async () => {
    const client = getClient();
    const response = await client.listParties({});

    expect(response).toBeDefined();
    expect(Array.isArray(response.partyDetails)).toBe(true);
  });

  test('getParticipantId returns participant identifier', async () => {
    const client = getClient();
    // Cast to handle void parameter type
    const response = await (client.getParticipantId as () => Promise<{ participantId: string }>)();

    expect(response).toBeDefined();
    expect(typeof response.participantId).toBe('string');
    expect(response.participantId.length).toBeGreaterThan(0);
  });

  // Skip: Requires admin permissions (returns HTTP 403 in cn-quickstart)
  test.skip('getConnectedSynchronizers returns synchronizer list', async () => {
    // This test requires admin permissions not available in cn-quickstart
  });
});
