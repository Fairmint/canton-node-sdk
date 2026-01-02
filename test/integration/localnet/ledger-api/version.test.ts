/**
 * LedgerJsonApiClient integration tests: Version API
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Version', () => {
  test('getVersion returns valid version info', async () => {
    const client = getClient();
    const version = await client.getVersion();

    expect(typeof version.version).toBe('string');
    expect(version.version.length).toBeGreaterThan(0);
    expect(version.features).toBeDefined();
  });
});
