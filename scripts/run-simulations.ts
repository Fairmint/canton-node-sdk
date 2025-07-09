import fs from 'fs';
import path from 'path';
import SimulationRunner from '../simulations/core/SimulationRunner';

async function runSimulations(): Promise<void> {
  const simulationsDir = path.join(process.cwd(), 'simulations');

  // Find all TypeScript files in the simulations directory (excluding core and index files)
  const simulationFiles = fs
    .readdirSync(simulationsDir)
    .filter(
      file =>
        file.endsWith('.ts') && file !== 'index.ts' && !file.startsWith('core')
    )
    .map(file => path.join(simulationsDir, file));

  console.log(`Found ${simulationFiles.length} simulation files:`);
  simulationFiles.forEach(file => console.log(`  - ${path.basename(file)}`));

  // Initialize simulation runner and clear results directory
  const runner = new SimulationRunner();
  runner.clearResultsDir();

  // Track failures
  let hasFailures = false;

  // Run each simulation file
  for (const file of simulationFiles) {
    console.log(`\n🚀 Running simulation: ${path.basename(file)}`);
    try {
      // Import and execute the simulation file
      await import(file);
      console.log(`✅ Completed: ${path.basename(file)}`);
    } catch (error) {
      console.error(`❌ Failed: ${path.basename(file)}`);
      console.error(error);
      hasFailures = true;
    }
  }

  if (hasFailures) {
    console.log('\n❌ Some simulations failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 All simulations completed successfully!');
  }
}

// Run the simulations
runSimulations().catch(error => {
  console.error('Failed to run simulations:', error);
  process.exit(1);
});
