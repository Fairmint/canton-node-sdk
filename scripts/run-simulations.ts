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

  // Run each simulation file sequentially
  for (const file of simulationFiles) {
    console.log(`\n🚀 Running simulation: ${path.basename(file)}`);
    try {
      // Import the simulation module
      const simulationModule = await import(file);

      // If the module exports a runAllTests function, call it and wait for completion
      if (typeof simulationModule.runAllTests === 'function') {
        await simulationModule.runAllTests();
      } else {
        // Fallback: if no runAllTests export, the module should have executed on import
        // Wait a bit to ensure any async operations complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

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
