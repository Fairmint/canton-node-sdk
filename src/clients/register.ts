import { ClientFactory } from '../core/ClientFactory';
import { BaseClient } from '../core/BaseClient';
import { ApiType } from '../core/types';
import { LedgerJsonApiClient } from './ledger-json-api/LedgerJsonApiClient';

// Register all available clients
ClientFactory.registerClient('LEDGER_JSON_API', LedgerJsonApiClient);

// Export the factory for convenience
export { ClientFactory };

// Export a convenience function to create clients
export function createClient(
  apiType: ApiType,
  config?: Parameters<typeof ClientFactory.createClient>[1]
): BaseClient {
  return ClientFactory.createClient(apiType, config);
}
