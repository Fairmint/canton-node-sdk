import { ClientFactory } from '../core/ClientFactory';

// Register the Ledger JSON API client
import { LedgerJsonApiClient } from './ledger-json-api/LedgerJsonApiClient';
ClientFactory.registerClient('LEDGER_JSON_API', LedgerJsonApiClient);

// Register the Validator API client
import { ValidatorApiClient } from './validator-api/ValidatorApiClient';
ClientFactory.registerClient('VALIDATOR_API', ValidatorApiClient);

// Register the Lighthouse API client
import { LighthouseApiClient } from './lighthouse-api/LighthouseApiClient';
ClientFactory.registerClient('LIGHTHOUSE_API', LighthouseApiClient);

// Export the factory for convenience
export { ClientFactory };
