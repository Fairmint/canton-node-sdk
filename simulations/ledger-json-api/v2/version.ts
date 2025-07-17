import SimulationRunner from '../../core/SimulationRunner';

const runner = new SimulationRunner();

export async function runAllTests() {
  // Test: successful version fetch
  await runner.runSimulation(
    'get_version',
    client => client.getVersion(),
  );
} 