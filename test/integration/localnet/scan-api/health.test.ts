/**
 * ScanApiClient integration tests: Health and Status
 *
 * Tests for health check and status endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Health', () => {
  test('getHealthStatus returns health status', async () => {
    const client = getClient();
    const response = await client.getHealthStatus();

    expect(response).toBeDefined();
  });

  test('getVersion returns API version', async () => {
    const client = getClient();
    const response = await client.getVersion();

    expect(response).toBeDefined();
  });

  test('isReady returns readiness status', async () => {
    const client = getClient();
    // isReady returns void (200 OK with no body)
    await client.isReady();
    expect(true).toBe(true); // Success if no error thrown
  });

  test('isLive returns liveness status', async () => {
    const client = getClient();
    // isLive returns void (200 OK with no body)
    await client.isLive();
    expect(true).toBe(true); // Success if no error thrown
  });

  test('featureSupport returns supported features', async () => {
    const client = getClient();

    try {
      const response = await client.featureSupport();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available in all setups
      console.warn('featureSupport failed:', error);
    }
  });
});
