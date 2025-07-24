import SimulationRunner from '../../../../core/SimulationRunner';

const runner = new SimulationRunner();

export async function runAllTests() {
  await runner.runSimulation(
    'valid',
    client => client.getTransferFactory({
      choiceArguments: {},
      excludeDebugFields: false,
    }),
  );

  await runner.runSimulation(
    'valid_with_debug_excluded',
    client => client.getTransferFactory({
      choiceArguments: {},
      excludeDebugFields: true,
    }),
  );

} 