import { LedgerJsonApiClient, ScanApiClient, ValidatorApiClient } from '../src';

/**
 * Global test clients - constructed once and shared across all tests
 *
 * Prerequisites:
 *
 * - LocalNet must be running (set up by CI or manually via scripts)
 *
 * These clients are configured to connect to LocalNet and are used by integration tests to validate SDK connectivity
 * and operations.
 */
export const testClients = {
  ledgerJsonApi: new LedgerJsonApiClient({
    network: 'localnet',
  }),
  validatorApi: new ValidatorApiClient({
    network: 'localnet',
  }),
  scanApi: new ScanApiClient({
    network: 'localnet',
    endpoints: [{ name: 'localnet', url: 'http://scan.localhost:4000' }],
  }),
};
