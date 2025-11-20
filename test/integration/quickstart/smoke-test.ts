#!/usr/bin/env tsx
/**
 * CN-Quickstart LocalNet Smoke Test
 *
 * This is a simple smoke test that validates the SDK can connect to cn-quickstart
 * and perform basic operations. It's designed to run in CI.
 *
 * Exit codes:
 * - 0: All tests passed
 * - 1: Tests failed
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../../src';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      error: errorMessage,
      duration: Date.now() - start,
    });
    console.error(`❌ ${name} (${Date.now() - start}ms)`);
    console.error(`   Error: ${errorMessage}`);
  }
}

async function main(): Promise<void> {
  console.log('🧪 Running CN-Quickstart LocalNet Smoke Tests\n');

  // Initialize clients with simple configuration
  const validatorClient = new ValidatorApiClient({
    network: 'localnet',
  });

  const jsonClient = new LedgerJsonApiClient({
    network: 'localnet',
  });

  // Test 1: Authentication
  await runTest('OAuth2 Authentication', async () => {
    const token = await validatorClient.authenticate();
    if (!token || token.length === 0) {
      throw new Error('Token is empty');
    }
  });

  // Test 2: Validator API - getUserStatus
  await runTest('Validator API - getUserStatus()', async () => {
    const userStatus = await validatorClient.getUserStatus();
    if (!userStatus || typeof userStatus.user_onboarded !== 'boolean') {
      throw new Error('Invalid user status response');
    }
  });

  // Test 3: Validator API - getDsoPartyId
  await runTest('Validator API - getDsoPartyId()', async () => {
    const dsoPartyId = await validatorClient.getDsoPartyId();
    if (!dsoPartyId) {
      throw new Error('DSO party ID is empty');
    }
    // getDsoPartyId returns an object or string depending on the API version
    const partyIdStr = typeof dsoPartyId === 'string' ? dsoPartyId : JSON.stringify(dsoPartyId);
    if (!partyIdStr || partyIdStr.length === 0) {
      throw new Error(`Invalid DSO party ID: ${partyIdStr}`);
    }
  });

  // Test 4: Ledger JSON API - getVersion
  await runTest('Ledger JSON API - getVersion()', async () => {
    const version = await jsonClient.getVersion();
    if (!version || !version.version) {
      throw new Error('Invalid version response');
    }
    if (!/^\d+\.\d+\.\d+/.test(version.version)) {
      throw new Error(`Invalid version format: ${version.version}`);
    }
  });

  // Test 5: Ledger JSON API - getLedgerEnd
  await runTest('Ledger JSON API - getLedgerEnd()', async () => {
    const ledgerEnd = await jsonClient.getLedgerEnd({});
    if (!ledgerEnd) {
      throw new Error('Ledger end response is empty');
    }
    // Check if response has offset property (could be string or object)
    if (!('offset' in ledgerEnd)) {
      throw new Error(`Invalid ledger end response - missing offset property`);
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Results Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
  process.exit(0);
}

// Run the tests
main().catch((error) => {
  console.error('\n💥 Fatal error running tests:');
  console.error(error);
  process.exit(1);
});
