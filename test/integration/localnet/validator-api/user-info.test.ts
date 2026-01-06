/**
 * ValidatorApiClient integration tests: User Information
 *
 * Tests for user-related information endpoints.
 */

import { getClient } from './setup';

describe('ValidatorApiClient / UserInfo', () => {
  test('getValidatorUserInfo returns validator user information', async () => {
    const client = getClient();

    const response = await client.getValidatorUserInfo();

    expect(response).toBeDefined();
  });
});
