#!/usr/bin/env tsx
/**
 * Example: Canton Network LocalNet with OAuth2 Authentication
 *
 * This example demonstrates how to connect to cn-quickstart with OAuth2/Keycloak
 * authentication using the Canton Node SDK.
 *
 * Prerequisites:
 * - cn-quickstart is running with OAuth2 enabled
 * - Run `cd quickstart && make setup` and choose "with OAuth2"
 * - Run `cd quickstart && make start`
 *
 * The SDK automatically handles:
 * - OAuth2 token acquisition
 * - Token refresh
 * - Bearer token injection in API calls
 *
 * Usage:
 *   npx tsx canton-node-sdk/examples/localnet-with-oauth2.ts
 */

import { ValidatorApiClient, LedgerJsonApiClient } from '../src';

async function main(): Promise<void> {
  console.log('🔌 Connecting to Canton Network LocalNet with OAuth2...\n');

  try {
    // ✨ Simple configuration! The SDK now has cn-quickstart defaults built-in
    // Just specify the network and it automatically configures:
    // - OAuth2 auth URL (Keycloak)
    // - API endpoints (ports 3903, 3975, etc.)
    // - Client credentials (app-provider-validator)
    const validatorClient = new ValidatorApiClient({
      network: 'localnet',
    });

    const jsonClient = new LedgerJsonApiClient({
      network: 'localnet',
    });

    console.log('🔐 Authenticating with OAuth2...');

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
    console.log('   1. Auto-configured OAuth2 URL (http://localhost:8082/realms/AppProvider/...)');
    console.log('   2. Auto-configured API endpoints (Validator: 3903, JSON API: 3975)');
    console.log('   3. Auto-configured client credentials (app-provider-validator)');
    console.log('   4. Connected to Keycloak and got access token');
    console.log('   5. Automatically included Bearer token in all API requests');
    console.log('   6. Will auto-refresh token when it expires');

    console.log('\n📡 Testing Ledger JSON API: getVersion()...');
    const version = await jsonClient.getVersion();
    console.log('✅ Ledger JSON API call successful!\n');
    console.log('Ledger API Version:', version.version);
    console.log('Features:', JSON.stringify(version.features, null, 2));

    console.log('\n💡 Next steps:');
    console.log('   - Try other Validator API methods: getWalletBalance(), getAmulets(), etc.');
    console.log('   - Try Ledger JSON API methods: listUsers(), getLedgerEnd(), etc.');
    console.log('   - Check out canton-node-sdk/scripts/examples/ for more examples');
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
        console.log('\n💡 Authentication failed. This could mean:');
        console.log('   1. cn-quickstart is not configured with OAuth2');
        console.log('      → Run: cd quickstart && make setup (choose "with OAuth2")');
        console.log('   2. Keycloak is not accessible');
        console.log('      → Check: http://localhost:8082');
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the main function
main();
