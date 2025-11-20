/**
 * Test client initialization helper
 *
 * Provides a consistent way to create clients for integration tests against localnet.
 */

import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';

/**
 * Creates a LedgerJsonApiClient configured for localnet testing
 */
export function createTestClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient({
    network: 'localnet',
  });
}
