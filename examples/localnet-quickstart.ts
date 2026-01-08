#!/usr/bin/env tsx
/**
 * Example: Canton Network LocalNet Quickstart
 *
 * This example demonstrates how to connect to cn-quickstart using the Canton Node SDK.
 *
 * Prerequisites:
 *
 * - Cn-quickstart is running
 * - Run `cd quickstart && make start`
 *
 * The SDK automatically handles:
 *
 * - JWT token generation (using unsafe-auth mode)
 * - Bearer token injection in API calls
 *
 * Usage: npx tsx examples/localnet-quickstart.ts
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../src';

async function main(): Promise<void> {
  console.log('🔌 Connecting to Canton Network LocalNet...\n');

  try {
    // ✨ Simple configuration! The SDK has cn-quickstart defaults built-in
    // Just specify the network and it automatically configures:
    // - JWT authentication (unsafe-auth mode)
    // - API endpoints (ports 3903, 3975, etc.)
    const validatorClient = new ValidatorApiClient({
      network: 'localnet',
    });

    const jsonClient = new LedgerJsonApiClient({
      network: 'localnet',
    });

    console.log('🔐 Authenticating with JWT...');

    // The SDK will automatically call authenticate() before API calls,
    // but we can also call it explicitly to test authentication
    const token = await validatorClient.authenticate();
    console.log('✅ Authentication successful!');
    console.log(`   Token acquired: ${token.substring(0, 50)}...\n`);

    console.log('📡 Calling Validator API: getUserStatus()...');

    // Make an API call - the SDK automatically includes the bearer token
    const userStatus = await validatorClient.getUserStatus();

    console.log('✅ API call successful!\n');
    console.log('User Status:');
    console.log(JSON.stringify(userStatus, null, 2));

    console.log('\n✨ Connection test successful!');
    console.log('\n📚 What the SDK did for you with just { network: "localnet" }:');
    console.log('   1. Auto-configured API endpoints (Validator: 3903, JSON API: 3975)');
    console.log('   2. Generated JWT token using unsafe-auth mode');
    console.log('   3. Automatically included Bearer token in all API requests');

    console.log('\n📡 Testing Ledger JSON API: getVersion()...');
    const version = await jsonClient.getVersion();
    console.log('✅ Ledger JSON API call successful!\n');
    console.log('Ledger API Version:', version.version);
    console.log('Features:', JSON.stringify(version.features, null, 2));

    console.log('\n💡 Next steps:');
    console.log('   - Try other Validator API methods: getWalletBalance(), getAmulets(), etc.');
    console.log('   - Try Ledger JSON API methods: listUsers(), getLedgerEnd(), etc.');
    console.log('   - Explore the web UIs:');
    console.log('     • Wallet: http://wallet.localhost:3000');
    console.log('     • Scan:   http://scan.localhost:4000');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 Make sure cn-quickstart is running:');
        console.log('   cd quickstart && make start');
      } else if (error.message.includes('401') || error.message.includes('authentication')) {
        console.log('\n💡 Authentication failed. Make sure cn-quickstart is running properly.');
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the main function
void main();
