#!/usr/bin/env node

/**
 * Simple Integration Example: Canton Node SDK
 * 
 * This example demonstrates basic SDK usage in a simple JavaScript project.
 * It shows how to handle common integration scenarios without complex setup.
 */

const { LedgerJsonApiClient, EnvLoader } = require('@fairmint/canton-node-sdk');

console.log('🚀 Canton Node SDK Simple Integration Example\n');

// Example 1: Show direct client creation
console.log('📋 Creating Ledger JSON API Client:');

// Example 2: Try to create a client with environment configuration
console.log('🔧 Attempting to create client with environment config...');
try {
  console.log('   ⚙️ Loading config...');
  const config = EnvLoader.getConfig('LEDGER_JSON_API', { network: 'devnet', provider: '5n' });
  console.log('   ✨ Config loaded successfully!');
  console.log('   🔄 Creating client...');
  const client = new LedgerJsonApiClient(config);
  console.log(`   📊 Client type: ${client.constructor.name}\n`);
  console.log('   ✅ Client created successfully!');
} catch (error) {
  console.log('   ⚠️  Client creation failed (expected without environment variables):');
  console.log(`      ${error.message}\n`);
}

// Example 3: Show integration patterns
console.log('💡 Integration Patterns:');
console.log('   1. Use EnvLoader.getConfig("API_TYPE") to load environment configuration');
console.log('   2. Create clients directly with new LedgerJsonApiClient(config)');
console.log('   3. Use try-catch blocks to handle configuration errors gracefully');
console.log('   4. Set up environment variables for production use');
console.log('   5. Use the SDK in a way that fails gracefully in development\n');

console.log('✅ Integration example completed successfully!');
console.log('📚 Check the README for more detailed examples and configuration options.'); 