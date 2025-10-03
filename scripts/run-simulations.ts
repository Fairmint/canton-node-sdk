import fs from 'fs';
import path from 'path';
import SimulationRunner from '../simulations/core/SimulationRunner';

function findSimulationFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file === 'core') continue;
      results = results.concat(findSimulationFiles(filePath));
    } else if (file.endsWith('.ts') && file !== 'index.ts') {
      results.push(filePath);
    }
  }
  return results;
}

async function runSimulations(): Promise<void> {
  const simulationsDir = path.join(process.cwd(), 'simulations');

  // Recursively find all TypeScript files in the simulations directory (excluding core and index files)
  const simulationFiles = findSimulationFiles(simulationsDir);

  // Initialize simulation runner and clear results directory
  const runner = new SimulationRunner();
  runner.clearResultsDir();

  // Track failures
  let hasFailures = false;

  // Run each simulation file sequentially
  for (const file of simulationFiles) {
    console.log(`Running simulation: ${file}`);
    try {
      // Import the simulation module
      const simulationModule = await import(file);

      // If the module exports a runAllTests function, call it and wait for completion
      if (typeof simulationModule.runAllTests === 'function') {
        await simulationModule.runAllTests();
      } else {
        // Fallback: if no runAllTests export, the module should have executed on import
        // Wait a bit to ensure any async operations complete
        await new Promise((resolve) => global.setTimeout(resolve, 100));
      }

      console.log(`✓ Simulation completed: ${file}`);
    } catch (error) {
      console.error(`✗ Simulation failed: ${file}`);
      console.error(error);
      hasFailures = true;
    }
  }

  if (hasFailures) {
    console.error('Some simulations failed');
    process.exit(1);
  } else {
    console.log('All simulations passed');
  }
}

// Run the simulations
runSimulations().catch((error) => {
  console.error('Error running simulations:', error);
  process.exit(1);
});
