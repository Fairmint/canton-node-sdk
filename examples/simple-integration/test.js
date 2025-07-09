#!/usr/bin/env node

/**
 * Simple Test for Canton Node SDK Integration
 * 
 * This test verifies that the SDK can be imported and used correctly
 * in a simple JavaScript environment without complex setup.
 */

const { ClientFactory } = require('@fairmint/canton-node-sdk');

console.log('🧪 Running Canton Node SDK Integration Tests\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Basic import
runTest('SDK can be imported', () => {
  if (!ClientFactory) {
    throw new Error('ClientFactory not found');
  }
});

// Test 2: Factory methods exist
runTest('Factory methods are available', () => {
  if (typeof ClientFactory.createClient !== 'function') {
    throw new Error('createClient method not found');
  }
  if (typeof ClientFactory.hasClient !== 'function') {
    throw new Error('hasClient method not found');
  }
  if (typeof ClientFactory.getRegisteredApiTypes !== 'function') {
    throw new Error('getRegisteredApiTypes method not found');
  }
});

// Test 3: API types are registered
runTest('API types are registered', () => {
  const apiTypes = ClientFactory.getRegisteredApiTypes();
  if (!Array.isArray(apiTypes)) {
    throw new Error('getRegisteredApiTypes should return an array');
  }
  if (apiTypes.length === 0) {
    throw new Error('No API types registered');
  }
  if (!apiTypes.includes('LEDGER_JSON_API')) {
    throw new Error('LEDGER_JSON_API not found in registered types');
  }
});

// Test 4: Client availability check
runTest('Client availability check works', () => {
  if (!ClientFactory.hasClient('LEDGER_JSON_API')) {
    throw new Error('LEDGER_JSON_API client should be available');
  }
  if (ClientFactory.hasClient('NON_EXISTENT_API')) {
    throw new Error('Non-existent API should not be available');
  }
});

// Test 5: Graceful error handling
runTest('Graceful error handling for missing config', () => {
  try {
    ClientFactory.createClient('LEDGER_JSON_API');
    // If we get here, it might work with default config, which is fine
  } catch (error) {
    // Expected error without configuration
    if (!error.message) {
      throw new Error('Error should have a message');
    }
  }
});

// Test 6: Error handling for non-existent API
runTest('Error handling for non-existent API', () => {
  try {
    ClientFactory.createClient('NON_EXISTENT_API');
    throw new Error('Should have thrown an error for non-existent API');
  } catch (error) {
    if (!error.message) {
      throw new Error('Error should have a message');
    }
    if (!error.message.includes('NON_EXISTENT_API')) {
      throw new Error('Error message should mention the invalid API type');
    }
  }
});

// Summary
console.log('\n📊 Test Results:');
console.log(`   Passed: ${testsPassed}`);
console.log(`   Failed: ${testsFailed}`);
console.log(`   Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! The SDK is ready for integration.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Check the errors above.');
  process.exit(1);
} 