import { LedgerJsonApiClient, ValidatorApiClient } from '../src';

// Global test clients - constructed once and shared across all tests
export const testClients = {
  ledgerJsonApi: new LedgerJsonApiClient({
    network: 'localnet',
  }),
  validatorApi: new ValidatorApiClient({
    network: 'localnet',
  }),
};
