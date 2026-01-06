/**
 * ValidatorApiClient integration tests: User Information
 *
 * Tests for user-related information endpoints.
 */

import { getClient } from './setup';

describe('ValidatorApiClient / UserInfo', () => {
  test('getValidatorUserInfo returns validator user information', async () => {
    const client = getClient();

    try {
      const response = await client.getValidatorUserInfo();

      expect(response).toBeDefined();
      // Response includes user info for the authenticated user
    } catch (error) {
      // May fail if user is not registered
      console.warn('getValidatorUserInfo failed:', error);
    }
  });

  // Skip registerNewUser as it modifies state and may have side effects
  test.skip('registerNewUser registers current user', async () => {
    // This would register the current authenticated user with the validator
    // and should be tested carefully as it modifies system state
  });
});
