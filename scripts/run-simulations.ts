import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const simulationsDir = path.join(process.cwd(), 'simulations');

// Find all TypeScript files in the simulations directory
const simulationFiles = fs
  .readdirSync(simulationsDir)
  .filter(file => file.endsWith('.ts') && file !== 'index.ts')
  .map(file => path.join(simulationsDir, file));

console.log(`Found ${simulationFiles.length} simulation files:`);
simulationFiles.forEach(file => console.log(`  - ${path.basename(file)}`));

// Track failures
let hasFailures = false;

// Run each simulation file
for (const file of simulationFiles) {
  console.log(`\n🚀 Running simulation: ${path.basename(file)}`);
  try {
    execSync(`tsx ${file}`, { stdio: 'inherit' });
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
