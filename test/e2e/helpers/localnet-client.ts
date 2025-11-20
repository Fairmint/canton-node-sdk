/**
 * E2E Test Helper: LocalNet Client Configuration
 *
 * Provides pre-configured clients for E2E testing against localnet.
 * These clients use the default localnet configuration with OAuth2 authentication.
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../../build/src';

/**
 * Create a pre-configured LedgerJsonApiClient for localnet E2E testing
 */
export function createLocalnetLedgerClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient({
    network: 'localnet',
  });
}

/**
 * Create a pre-configured ValidatorApiClient for localnet E2E testing
 */
export function createLocalnetValidatorClient(): ValidatorApiClient {
  return new ValidatorApiClient({
    network: 'localnet',
  });
}
