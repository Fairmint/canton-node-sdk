/**
 * ScanApiClient integration tests: Amulet Rules
 */

import { getClient } from './setup';

describe('ScanApiClient / Amulet', () => {
  test('getAmuletRules returns amulet configuration', async () => {
    const client = getClient();
    const response = await client.getAmuletRules({ body: {} });

    expect(response).toBeDefined();
    expect(response.amulet_rules_update).toBeDefined();
  });
});
