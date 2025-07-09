#!/usr/bin/env node

/**
 * Simple Integration Example: Canton Node SDK
 * 
 * This example demonstrates basic SDK usage in a simple JavaScript project.
 * It shows how to handle common integration scenarios without complex setup.
 */

const { ClientFactory, EnvLoader } = require('@fairmint/canton-node-sdk');

console.log('🚀 Canton Node SDK Simple Integration Example\n');

// Example 1: Check what's available
console.log('📋 Available API Types:');
const availableTypes = ClientFactory.getRegisteredApiTypes();
console.log(`   ${availableTypes.join(', ')}\n`);

// Example 2: Check client availability
console.log('🔍 Client Availability:');
const hasLedgerClient = ClientFactory.hasClient('LEDGER_JSON_API');
console.log(`   Ledger JSON API client available: ${hasLedgerClient}\n`);

// Example 3: Try to create a client with environment configuration
console.log('🔧 Attempting to create client with environment config...');
try {
  const config = EnvLoader.getConfig('LEDGER_JSON_API');
  const client = ClientFactory.createClient('LEDGER_JSON_API', config);
  console.log('   ✅ Client created successfully!');
  console.log(`   📊 Client type: ${client.constructor.name}\n`);
} catch (error) {
  console.log('   ⚠️  Client creation failed (expected without environment variables):');
  console.log(`      ${error.message}\n`);
}

// Example 4: Show integration patterns
console.log('💡 Integration Patterns:');
console.log('   1. Use EnvLoader.getConfig("API_TYPE") to load environment configuration');
console.log('   2. Always check ClientFactory.hasClient() before creating clients');
console.log('   3. Use try-catch blocks to handle configuration errors gracefully');
console.log('   4. Set up environment variables for production use');
console.log('   5. Use the SDK in a way that fails gracefully in development\n');

console.log('✅ Integration example completed successfully!');
console.log('📚 Check the README for more detailed examples and configuration options.'); 