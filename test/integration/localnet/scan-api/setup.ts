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
    // SDK's localnet defaults include the correct scan API URL with /api/scan path
    client = new ScanApiClient(config);
  }
  return client;
}
