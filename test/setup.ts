import { CantonRuntime, LedgerJsonApiClient, ValidatorApiClient } from '../src';

const runtime = new CantonRuntime({
  network: 'localnet',
});

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
  ledgerJsonApi: new LedgerJsonApiClient(runtime),
  validatorApi: new ValidatorApiClient(runtime),
};
