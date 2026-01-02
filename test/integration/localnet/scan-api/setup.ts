/**
 * Shared setup for ScanApiClient integration tests.
 */

import { ScanApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';

let client: ScanApiClient | null = null;

/**
 * Get the shared ScanApiClient instance for tests.
 * Creates the client on first call, reuses it for subsequent calls.
 */
export function getClient(): ScanApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    // LocalNet doesn't have default scan endpoints - must provide explicitly
    // cn-quickstart runs scan at localhost:4000 with /api/scan path
    client = new ScanApiClient({
      ...config,
      scanApiUrls: ['http://localhost:4000/api/scan'],
    });
  }
  return client;
}
