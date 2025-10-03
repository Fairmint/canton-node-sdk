import SimulationRunner from '../../../core/SimulationRunner';

const runner = new SimulationRunner();

const TEST_CONTRACT_IDS = {
  VALID:
    '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba0',
  INVALID_FORMAT:
    '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9ba01',
  NON_EXISTENT:
    '00528fab06fe8694392494a01925bae6cdb94c35c14a8bbffcebca23278521b2e4ca1112200794083bad5ae157d245234eaa24b5dff2a88b1d62caa8c70701fab4ba4f9baa',
} as const;

export async function runAllTests() {
  await runner.runSimulation('valid', async (client) =>
    client.getEventsByContractId({
      contractId: TEST_CONTRACT_IDS.VALID,
    })
  );

  await runner.runSimulation('invalid_format', async (client) =>
    client.getEventsByContractId({
      contractId: TEST_CONTRACT_IDS.INVALID_FORMAT,
    })
  );

  await runner.runSimulation('non_existent', async (client) =>
    client.getEventsByContractId({
      contractId: TEST_CONTRACT_IDS.NON_EXISTENT,
    })
  );
}
