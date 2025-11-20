/**
 * E2E Test: Ledger JSON API - List Packages
 *
 * This test validates the listPackages() API against a running localnet instance. It demonstrates the happy path with
 * valid inputs and expected outputs.
 *
 * ## What This Tests
 *
 * - **Authentication**: SDK automatically handles OAuth2 authentication with Keycloak
 * - **API Call**: Calls GET /v2/packages endpoint
 * - **Response Validation**: Verifies response structure, array format, and package data
 *
 * ## Prerequisites
 *
 * - LocalNet must be running (npm run localnet:start)
 * - Services must be healthy and ready
 * - Some packages should be loaded (localnet typically has default packages)
 *
 * ## Expected Response Structure
 *
 * ```json
 * {
 *   "packages": [
 *     {
 *       "packageId": "abc123...",
 *       "size": 12345
 *     }
 *   ]
 * }
 * ```
 *
 * ## Usage
 *
 * ```bash
 * # Run all e2e tests
 * npm run test:e2e
 *
 * # Run this specific test
 * tsx test/e2e/ledger-json-api/packages.e2e.ts
 * ```
 */

import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('Ledger JSON API - List Packages');
  const client = createLedgerJsonApiClient();

  console.log('\n📦 E2E Test: Ledger JSON API - List Packages\n');
  console.log('Testing endpoint: GET /v2/packages');
  console.log('Network: localnet');
  console.log('Provider: app-provider\n');

  // Test 1: Basic API call succeeds
  await runner.runTest('Should successfully call listPackages()', async () => {
    const response = await client.listPackages();
    assert.isDefined(response, 'Response should be defined');
  });

  // Test 2: Response contains packages array
  await runner.runTest('Should return packages array', async () => {
    const response = await client.listPackages();
    assert.hasProperty(response, 'packages', 'Response should have packages property');
    assert.isArray(response.packages, 'Packages should be an array');
    console.log(`    Found ${response.packages.length} packages`);
  });

  // Test 3: Packages array is not empty (localnet should have default packages)
  await runner.runTest('Should have at least one package', async () => {
    const response = await client.listPackages();
    assert.greaterThan(response.packages.length, 0, 'Should have at least one package in localnet');
  });

  // Test 4: First package has required fields
  await runner.runTest('Should have valid package structure', async () => {
    const response = await client.listPackages();
    const firstPackage = response.packages[0];
    assert.isDefined(firstPackage, 'First package should be defined');
    assert.hasProperty(firstPackage, 'packageId', 'Package should have packageId');
    assert.hasProperty(firstPackage, 'size', 'Package should have size');
  });

  // Test 5: packageId is a valid string
  await runner.runTest('Should have valid packageId format', async () => {
    const response = await client.listPackages();
    const firstPackage = response.packages[0];
    assert.isString(firstPackage.packageId, 'packageId should be a string');
    assert.greaterThan(firstPackage.packageId.length, 0, 'packageId should not be empty');
    console.log(`    Example packageId: ${firstPackage.packageId.substring(0, 40)}...`);
  });

  // Test 6: size is a valid number
  await runner.runTest('Should have valid package size', async () => {
    const response = await client.listPackages();
    const firstPackage = response.packages[0];
    assert.isString(firstPackage.size, 'size should be a string (numeric string)');
    // Size in Canton is represented as a numeric string
    const sizeNum = parseInt(firstPackage.size, 10);
    assert.greaterThan(sizeNum, 0, 'Package size should be greater than 0');
    console.log(`    Example size: ${firstPackage.size} bytes`);
  });

  // Test 7: All packages have required fields
  await runner.runTest('Should have consistent structure across all packages', async () => {
    const response = await client.listPackages();
    for (const pkg of response.packages) {
      assert.hasProperty(pkg, 'packageId', 'All packages should have packageId');
      assert.hasProperty(pkg, 'size', 'All packages should have size');
      assert.isString(pkg.packageId, 'All packageIds should be strings');
      assert.isString(pkg.size, 'All sizes should be strings');
    }
  });

  // Test 8: Package IDs are unique
  await runner.runTest('Should have unique package IDs', async () => {
    const response = await client.listPackages();
    const packageIds = response.packages.map((pkg) => pkg.packageId);
    const uniqueIds = new Set(packageIds);
    assert.equals(uniqueIds.size, packageIds.length, 'All package IDs should be unique');
  });

  // Test 9: Response is consistent across multiple calls
  await runner.runTest('Should return consistent results', async () => {
    const response1 = await client.listPackages();
    const response2 = await client.listPackages();
    assert.equals(response1.packages.length, response2.packages.length, 'Package count should be consistent');
    // Compare first package ID if packages exist
    if (response1.packages.length > 0 && response2.packages.length > 0) {
      assert.equals(response1.packages[0].packageId, response2.packages[0].packageId, 'Package IDs should match');
    }
  });

  // Test 10: Can list details of all packages
  await runner.runTest('Should successfully enumerate all packages', async () => {
    const response = await client.listPackages();
    console.log(`    Total packages in ledger: ${response.packages.length}`);

    // Show summary statistics
    const sizes = response.packages.map((pkg) => parseInt(pkg.size, 10));
    const totalSize = sizes.reduce((sum, size) => sum + size, 0);
    const avgSize = sizes.length > 0 ? Math.round(totalSize / sizes.length) : 0;
    console.log(`    Total size: ${totalSize} bytes`);
    console.log(`    Average size: ${avgSize} bytes`);

    // All iterations should complete without error
    assert.greaterThan(response.packages.length, 0, 'Should have enumerated packages');
  });

  // Print summary and exit
  runner.printSummary();
  runner.exit();
}

// Run the tests
main().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
