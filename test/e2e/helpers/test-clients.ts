/**
 * Test Client Setup Helper
 *
 * Provides pre-configured clients for E2E testing against localnet. Centralizes client configuration to ensure
 * consistency across all e2e tests.
 */

import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ValidatorApiClient } from '../../../src/clients/validator-api';

/**
 * Create a LedgerJsonApiClient configured for localnet
 *
 * Uses the SDK's built-in localnet defaults which automatically configure:
 *
 * - OAuth2 URL (Keycloak at localhost:8082)
 * - JSON API endpoint (localhost:39750)
 * - Client credentials for authentication
 *
 * @returns LedgerJsonApiClient instance ready for testing
 */
export function createLedgerJsonApiClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient({
    network: 'localnet',
  });
}

/**
 * Create a ValidatorApiClient configured for localnet
 *
 * Uses the SDK's built-in localnet defaults which automatically configure:
 *
 * - OAuth2 URL (Keycloak at localhost:8082)
 * - Validator API endpoint (localhost:39030)
 * - Client credentials for authentication
 *
 * @returns ValidatorApiClient instance ready for testing
 */
export function createValidatorApiClient(): ValidatorApiClient {
  return new ValidatorApiClient({
    network: 'localnet',
  });
}
