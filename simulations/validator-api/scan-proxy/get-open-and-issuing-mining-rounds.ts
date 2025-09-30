import ValidatorSimulationRunner from '../../core/ValidatorSimulationRunner';

const runner = new ValidatorSimulationRunner();

export async function runAllTests(): Promise<void> {
  await runner.runSimulation('valid', client =>
    client.getOpenAndIssuingMiningRounds()
  );
}


