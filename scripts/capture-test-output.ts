#!/usr/bin/env tsx
/**
 * Helper script to capture actual API responses for integration tests Run this script against LocalNet to get the
 * actual output that should be used in tests
 *
 * Usage: npm run localnet:start tsx scripts/capture-test-output.ts
 */

import { LedgerJsonApiClient } from '../src';

async function captureOutputs(): Promise<void> {
  console.log('Connecting to LocalNet...\n');

  const client = new LedgerJsonApiClient({
    network: 'localnet',
  });

  console.log('='.repeat(80));
  console.log('LIST PARTIES OUTPUT');
  console.log('='.repeat(80));
  try {
    const parties = await client.listParties({});
    console.log('Copy this output into test/integration/localnet/list-parties.test.ts:');
    console.log('expect(response).toEqual(');
    console.log(JSON.stringify(parties, null, 2));
    console.log(');');
  } catch (error) {
    console.error('Error calling listParties:', error);
  }

  console.log('\n');
  console.log('='.repeat(80));
  console.log('LIST PACKAGES OUTPUT');
  console.log('='.repeat(80));
  try {
    const packages = await client.listPackages();
    console.log('Copy this output into test/integration/localnet/list-packages.test.ts:');
    console.log('expect(response).toEqual(');
    console.log(JSON.stringify(packages, null, 2));
    console.log(');');
  } catch (error) {
    console.error('Error calling listPackages:', error);
  }
}

captureOutputs().catch(console.error);
