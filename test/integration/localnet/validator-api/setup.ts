/** Shared setup for ValidatorApiClient integration tests. */

import { ValidatorApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';

let client: ValidatorApiClient | null = null;

/**
 * Get the shared ValidatorApiClient instance for tests. Creates the client on first call, reuses it for subsequent
 * calls.
 */
export function getClient(): ValidatorApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    client = new ValidatorApiClient(config);
  }
  return client;
}
