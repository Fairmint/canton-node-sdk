/**
 * E2E Test Runner - Run All Tests
 *
 * Executes all end-to-end tests in sequence and reports overall results. This script is the main entry point for
 * running the e2e test suite.
 *
 * ## Prerequisites
 *
 * - LocalNet must be running (npm run localnet:start)
 * - All services must be healthy
 *
 * ## Usage
 *
 * ```bash
 * npm run test:e2e
 * ```
 */

import { spawn } from 'child_process';
import path from 'path';

interface TestFile {
  name: string;
  path: string;
}

// List of all e2e test files to run
const testFiles: TestFile[] = [
  {
    name: 'Ledger JSON API - Get Version',
    path: 'test/e2e/ledger-json-api/version.e2e.ts',
  },
  {
    name: 'Ledger JSON API - List Packages',
    path: 'test/e2e/ledger-json-api/packages.e2e.ts',
  },
];

interface TestResult {
  name: string;
  passed: boolean;
  output: string;
}

/** Run a single test file */
async function runTest(testFile: TestFile): Promise<TestResult> {
  return new Promise((resolve) => {
    const testPath = path.join(process.cwd(), testFile.path);
    const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running: ${testFile.name}`);
    console.log(`File: ${testFile.path}`);
    console.log('='.repeat(80));

    const child = spawn(tsxPath, [testPath], {
      stdio: 'inherit',
      env: { ...process.env },
    });

    const output = '';

    child.on('close', (code) => {
      resolve({
        name: testFile.name,
        passed: code === 0,
        output,
      });
    });

    child.on('error', (error) => {
      console.error(`Error running test ${testFile.name}:`, error);
      resolve({
        name: testFile.name,
        passed: false,
        output: error.message,
      });
    });
  });
}

/** Run all tests */
async function runAllTests(): Promise<void> {
  console.log('\n🧪 Running E2E Test Suite');
  console.log(`Total tests: ${testFiles.length}\n`);

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run tests sequentially
  for (const testFile of testFiles) {
    const result = await runTest(testFile);
    results.push(result);
  }

  const duration = Date.now() - startTime;

  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('E2E TEST SUITE SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✓`);
  console.log(`Failed: ${failed} ✗`);
  console.log(`Duration: ${duration}ms`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}`);
      });
  }

  console.log(`\n${'='.repeat(80)}`);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run all tests
runAllTests().catch((error) => {
  console.error('Fatal error running test suite:', error);
  process.exit(1);
});
