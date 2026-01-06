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

  test('isReady completes without error', async () => {
    const client = getClient();
    // isReady returns void (200 OK with no body) - test passes if no error thrown
    await client.isReady();
  });

  test('isLive completes without error', async () => {
    const client = getClient();
    // isLive returns void (200 OK with no body) - test passes if no error thrown
    await client.isLive();
  });

  test('featureSupport returns supported features', async () => {
    const client = getClient();

    const response = await client.featureSupport();

    expect(response).toBeDefined();
  });
});
