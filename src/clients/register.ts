import { ClientFactory } from '../core/ClientFactory';

// Register the Ledger JSON API client
import { LedgerJsonApiClient } from './ledger-json-api/LedgerJsonApiClient';
ClientFactory.registerClient('LEDGER_JSON_API', LedgerJsonApiClient);

// Export the factory for convenience
export { ClientFactory };
