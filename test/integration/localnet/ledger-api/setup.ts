/** Shared setup for LedgerJsonApiClient integration tests. */

import { CantonRuntime, LedgerJsonApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';

let client: LedgerJsonApiClient | null = null;

/**
 * Get the shared LedgerJsonApiClient instance for tests. Creates the client on first call, reuses it for subsequent
 * calls.
 */
export function getClient(): LedgerJsonApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    client = new LedgerJsonApiClient(new CantonRuntime(config));
  }
  return client;
}
