export { simulationRunner } from './simulationRunner';

import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient';

// Export a convenience function for running simulations
export async function simulate<T>(
  simulationFn: (client: LedgerJsonApiClient) => Promise<T>,
  simulationName: string,
  expectedType?: keyof typeof import('../../src/utils/validators').validators
): Promise<T | { error: string; details: unknown }> {
  const { simulationRunner } = await import('./simulationRunner');
  const runner = new simulationRunner();
  return runner.runSimulation(simulationName, simulationFn, expectedType);
}
