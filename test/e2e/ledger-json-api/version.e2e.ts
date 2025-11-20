/**
 * E2E Test: Ledger JSON API - Get Version
 *
 * This test validates the getVersion() API against a running localnet instance. It demonstrates the happy path with
 * valid inputs and expected outputs.
 *
 * ## What This Tests
 *
 * - **Authentication**: SDK automatically handles OAuth2 authentication with Keycloak
 * - **API Call**: Calls GET /v2/version endpoint
 * - **Response Validation**: Verifies response structure and data types
 *
 * ## Prerequisites
 *
 * - LocalNet must be running (npm run localnet:start)
 * - Services must be healthy and ready
 *
 * ## Expected Response Structure
 *
 * ```json
 * {
 *   "version": "3.3.0-SNAPSHOT",
 *   "features": {
 *     "userManagement": {
 *       "supported": true,
 *       "maxRightsPerUser": 1000,
 *       "maxUsersPageSize": 1000
 *     },
 *     "participantId": "PAR::participant::..."
 *   }
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
 * tsx test/e2e/ledger-json-api/version.e2e.ts
 * ```
 */

import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('Ledger JSON API - Get Version');
  const client = createLedgerJsonApiClient();

  console.log('\n📋 E2E Test: Ledger JSON API - Get Version\n');
  console.log('Testing endpoint: GET /v2/version');
  console.log('Network: localnet');
  console.log('Provider: app-provider\n');

  // Test 1: Basic API call succeeds
  await runner.runTest('Should successfully call getVersion()', async () => {
    const response = await client.getVersion();
    assert.isDefined(response, 'Response should be defined');
  });

  // Test 2: Response contains version field
  await runner.runTest('Should return version field', async () => {
    const response = await client.getVersion();
    assert.hasProperty(response, 'version', 'Response should have version property');
    assert.isString(response.version, 'Version should be a string');
    console.log(`    Version: ${response.version}`);
  });

  // Test 3: Version follows semantic versioning pattern
  await runner.runTest('Should return valid version format', async () => {
    const response = await client.getVersion();
    // Canton versions follow pattern: X.Y.Z or X.Y.Z-SNAPSHOT
    const versionPattern = /^\d+\.\d+\.\d+(-[A-Z]+)?$/;
    assert.matches(response.version, versionPattern, `Version should match pattern X.Y.Z, got: ${response.version}`);
  });

  // Test 4: Response contains features field
  await runner.runTest('Should return features object', async () => {
    const response = await client.getVersion();
    assert.hasProperty(response, 'features', 'Response should have features property');
    assert.isDefined(response.features, 'Features should be defined');
  });

  // Test 5: Features contains userManagement
  await runner.runTest('Should include userManagement feature', async () => {
    const response = await client.getVersion();
    assert.isDefined(response.features, 'Features should be defined');
    assert.hasProperty(response.features!, 'userManagement', 'Features should have userManagement');
  });

  // Test 6: userManagement has expected structure
  await runner.runTest('Should have valid userManagement structure', async () => {
    const response = await client.getVersion();
    const userMgmt = response.features?.userManagement;
    assert.isDefined(userMgmt, 'userManagement should be defined');
    assert.hasProperty(userMgmt, 'supported', 'userManagement should have supported property');
    assert.isBoolean(userMgmt.supported, 'supported should be a boolean');
    assert.equals(userMgmt.supported, true, 'userManagement should be supported');
    console.log(`    userManagement.supported: ${userMgmt.supported}`);
  });

  // Test 7: userManagement has maxRightsPerUser
  await runner.runTest('Should include maxRightsPerUser', async () => {
    const response = await client.getVersion();
    const userMgmt = response.features?.userManagement;
    assert.isDefined(userMgmt, 'userManagement should be defined');
    assert.hasProperty(userMgmt, 'maxRightsPerUser', 'userManagement should have maxRightsPerUser');
    assert.isNumber(userMgmt.maxRightsPerUser, 'maxRightsPerUser should be a number');
    assert.greaterThan(userMgmt.maxRightsPerUser, 0, 'maxRightsPerUser should be positive');
    console.log(`    maxRightsPerUser: ${userMgmt.maxRightsPerUser}`);
  });

  // Test 8: userManagement has maxUsersPageSize
  await runner.runTest('Should include maxUsersPageSize', async () => {
    const response = await client.getVersion();
    const userMgmt = response.features?.userManagement;
    assert.isDefined(userMgmt, 'userManagement should be defined');
    assert.hasProperty(userMgmt, 'maxUsersPageSize', 'userManagement should have maxUsersPageSize');
    assert.isNumber(userMgmt.maxUsersPageSize, 'maxUsersPageSize should be a number');
    assert.greaterThan(userMgmt.maxUsersPageSize, 0, 'maxUsersPageSize should be positive');
    console.log(`    maxUsersPageSize: ${userMgmt.maxUsersPageSize}`);
  });

  // Test 9: Features contains participantId
  await runner.runTest('Should include participantId in features', async () => {
    const { features } = await client.getVersion();
    assert.isDefined(features, 'Features should be defined');
    // participantId is optional but if present, should be a string
    if ('participantId' in features && features.participantId) {
      assert.isString(features.participantId, 'participantId should be a string');
      console.log(`    participantId: ${features.participantId.substring(0, 30)}...`);
    }
  });

  // Test 10: Response is consistent across multiple calls
  await runner.runTest('Should return consistent results', async () => {
    const { version: version1, features: features1 } = await client.getVersion();
    const { version: version2, features: features2 } = await client.getVersion();
    assert.equals(version1, version2, 'Version should be consistent');
    // Both features should be defined since we validated them earlier
    assert.isDefined(features1, 'First features should be defined');
    assert.isDefined(features2, 'Second features should be defined');
    assert.isDefined(features1.userManagement, 'First userManagement should be defined');
    assert.isDefined(features2.userManagement, 'Second userManagement should be defined');
    assert.equals(
      features1.userManagement.supported,
      features2.userManagement.supported,
      'Features should be consistent'
    );
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
