/**
 * ValidatorApiClient integration tests: DSO Information
 */

import { getClient, TEST_TIMEOUT } from './setup';

describe('ValidatorApiClient / DSO', () => {
  jest.setTimeout(TEST_TIMEOUT);

  test('getDsoPartyId returns DSO party identifier', async () => {
    const client = getClient();
    const response = await client.getDsoPartyId();

    expect(response).toBeDefined();
    expect(typeof response.dso_party_id).toBe('string');
    expect(response.dso_party_id.length).toBeGreaterThan(0);
  });

  test('getAmuletRules returns amulet rules configuration', async () => {
    const client = getClient();
    const response = await client.getAmuletRules();

    expect(response).toBeDefined();
    expect(response.amulet_rules).toBeDefined();
    expect(response.amulet_rules.domain_id).toBeDefined();
  });
});
