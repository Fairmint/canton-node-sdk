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
    client = new ScanApiClient({
      ...config,
      scanApiUrls: [config.apis?.SCAN_API?.apiUrl ?? 'http://localhost:4000/api/scan'],
    });
  }
  return client;
}

/**
 * Standard test timeout for LocalNet operations.
 */
export const TEST_TIMEOUT = 60_000;
