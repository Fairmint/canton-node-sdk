/**
 * E2E Test: LedgerJsonApi - Version Endpoint
 *
 * Demonstrates the getVersion() API with full request/response examples.
 * This test serves as both validation and documentation.
 */

import { createLedgerClient } from './test-utils';

describe('LedgerJsonApi - getVersion()', () => {
  const client = createLedgerClient();

  it('should return version information', async () => {
    const result = await client.getVersion();

    // Assert the exact structure - this documents the API response
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('features');
    expect(typeof result.version).toBe('string');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);

    // Validate features structure
    expect(result.features).toHaveProperty('userManagement');
    if (result.features?.userManagement) {
      expect(result.features.userManagement).toHaveProperty('supported');
      expect(typeof result.features.userManagement.supported).toBe('boolean');
    }
  }, 30000);

  it('should have consistent response structure', async () => {
    const result1 = await client.getVersion();
    const result2 = await client.getVersion();

    // Version info should be consistent across calls
    expect(result1.version).toBe(result2.version);
    expect(result1.features).toEqual(result2.features);
  }, 30000);
});
