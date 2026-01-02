/**
 * ValidatorApiClient integration tests: Admin Operations
 */

import { getClient } from './setup';

describe('ValidatorApiClient / Admin', () => {
  test('dumpParticipantIdentities returns identities', async () => {
    const client = getClient();
    const response = await client.dumpParticipantIdentities();

    expect(response).toBeDefined();
    expect(response.id).toBeDefined();
  });

  test('listUsers returns user list', async () => {
    const client = getClient();
    const response = await client.listUsers();

    expect(response).toBeDefined();
    expect(Array.isArray(response.usernames)).toBe(true);
  });
});
