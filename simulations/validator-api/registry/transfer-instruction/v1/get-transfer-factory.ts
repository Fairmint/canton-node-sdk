import ValidatorSimulationRunner from '../../../../core/ValidatorSimulationRunner';

const runner = new ValidatorSimulationRunner();

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