#!/usr/bin/env tsx
/**
 * Example: Canton Unified Client
 *
 * Demonstrates the Canton class which provides a unified entry point for
 * all Canton API clients with shared configuration.
 *
 * Prerequisites:
 * - cn-quickstart running
 * - Run `cd quickstart && make start`
 *
 * Usage: npx tsx examples/canton-quickstart.ts
 */

import { Canton } from '../src';

async function main(): Promise<void> {
  console.log('🔌 Canton Unified Client Example\n');

  try {
    // Create a Canton instance - this initializes all clients with shared config
    const canton = new Canton({ network: 'localnet' });

    console.log(`📡 Network: ${canton.getNetwork()}`);
    console.log('');

    // Use the Ledger JSON API client
    console.log('📦 Testing Ledger JSON API...');
    const version = await canton.ledger.getVersion();
    console.log(`   Version: ${version.version}`);

    // Use the Validator API client
    console.log('📋 Testing Validator API...');
    const dsoPartyId = await canton.validator.getDsoPartyId();
    console.log(`   DSO Party ID: ${dsoPartyId.dso_party_id.substring(0, 40)}...`);

    // Use the Scan API client (public, unauthenticated)
    console.log('🔍 Testing Scan API...');
    const health = await canton.scan.getHealthStatus();
    const status = 'success' in health ? 'healthy' : 'not_initialized' in health ? 'initializing' : 'failed';
    console.log(`   Scan API status: ${status}`);

    console.log('\n✅ All clients working correctly!');

    // Show how to set party ID dynamically
    console.log('\n💡 Tip: Use canton.setPartyId() to update party ID across all clients');
    console.log('   This is useful when you discover the party ID at runtime.');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n💡 Make sure cn-quickstart is running:');
    console.log('   cd quickstart && make start');
    process.exit(1);
  }
}

void main();
