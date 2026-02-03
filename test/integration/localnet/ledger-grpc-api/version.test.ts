/**
 * LedgerGrpcClient integration tests: Version API
 *
 * Demonstrates basic connectivity and version retrieval via gRPC.
 */

import { closeClient, getClient } from './setup';

describe('LedgerGrpcClient / Version', () => {
  afterAll(() => {
    closeClient();
  });

  test('getVersion returns valid Ledger API version', async () => {
    const client = await getClient();
    const version = await client.getVersion();

    expect(typeof version.version).toBe('string');
    expect(version.version.length).toBeGreaterThan(0);

    // Version should follow semver-like format (e.g., "3.4.0")
    expect(version.version).toMatch(/^\d+\.\d+/);
  });
});
