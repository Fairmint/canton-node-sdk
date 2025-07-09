import SimulationRunner from './core/SimulationRunner.old';
import { EventsByContractIdResponseSchema } from '../src/clients/ledger-json-api/schemas';

const runner = new SimulationRunner();

const TEST_CONTRACT_IDS = {
  VALID: '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba0',
  INVALID_FORMAT: '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba01',
  NON_EXISTENT: 'a0528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba0',
} as const;

async function runAllTests() {
  await runner.runSimulation(
    'getEventsByContractId_valid',
    client => client.getEventsByContractId.execute({
      contractId: TEST_CONTRACT_IDS.VALID,
    }),
    EventsByContractIdResponseSchema
  );

  await runner.runSimulation(
    'getEventsByContractId_invalid_format',
    client => client.getEventsByContractId.execute({
      contractId: TEST_CONTRACT_IDS.INVALID_FORMAT,
    })
  );

  await runner.runSimulation(
    'getEventsByContractId_non_existent',
    client => client.getEventsByContractId.execute({
      contractId: TEST_CONTRACT_IDS.NON_EXISTENT,
    })
  );
}

runAllTests();
