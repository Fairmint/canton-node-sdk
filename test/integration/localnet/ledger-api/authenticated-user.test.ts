/**
 * LedgerJsonApiClient integration tests: Authenticated User
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / AuthenticatedUser', () => {
  test('getAuthenticatedUser returns current user info', async () => {
    const client = getClient();
    const response = await client.getAuthenticatedUser({});

    expect(response).toBeDefined();
    expect(response.user).toBeDefined();
    expect(response.user.id).toBeDefined();
    expect(typeof response.user.id).toBe('string');
    expect(response.user.id.length).toBeGreaterThan(0);

    // User may have optional properties
    if (response.user.primaryParty) {
      expect(typeof response.user.primaryParty).toBe('string');
    }
  });
});
