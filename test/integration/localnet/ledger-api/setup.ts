/**
 * Shared setup for LedgerJsonApiClient integration tests.
 */

import { LedgerJsonApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';

let client: LedgerJsonApiClient | null = null;

/**
 * Get the shared LedgerJsonApiClient instance for tests.
 * Creates the client on first call, reuses it for subsequent calls.
 */
export function getClient(): LedgerJsonApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    client = new LedgerJsonApiClient(config);
  }
  return client;
}

/**
 * Standard test timeout for LocalNet operations.
 */
export const TEST_TIMEOUT = 60_000;
