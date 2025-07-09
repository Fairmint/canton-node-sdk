import SimulationRunner from './core/SimulationRunner';
import { LedgerJsonApiClient } from '../src/clients/ledger-json-api/LedgerJsonApiClient';
import { EventsByContractIdResponseSchema } from '../src/clients/ledger-json-api/schemas';
import { TEST_CONTRACT_IDS } from './utils/simulationHelpers';

// Main simulation: get events by contract ID and write result
const runner = new SimulationRunner();

(async () => {
  await runner.runSimulation(
    'getEventsByContractId_success',
    async (client: LedgerJsonApiClient) => {
      const result = await client.getEventsByContractId.execute({
        contractId: TEST_CONTRACT_IDS.VALID,
      });
      return result;
    },
    EventsByContractIdResponseSchema
  );
})();
