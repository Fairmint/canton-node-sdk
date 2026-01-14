#!/usr/bin/env tsx
/**
 * Example: Create a Party with Funding
 *
 * Demonstrates how to create a new party on the Canton network using the createParty utility function. This creates a
 * party, funds it with amulets, and sets up a transfer preapproval contract.
 *
 * Prerequisites:
 *
 * - Cn-quickstart running with OAuth2 enabled
 * - A funded validator party (the sender)
 *
 * Usage: npx tsx examples/create-party.ts [party-name] [amount]
 */

import { Canton, createParty } from '../src';

async function main(): Promise<void> {
  const partyName = process.argv[2] ?? `test-party-${Date.now()}`;
  const amount = process.argv[3] ?? '10';

  console.log('🎉 Create Party Example\n');
  console.log(`   Party name: ${partyName}`);
  console.log(`   Funding amount: ${amount} amulets\n`);

  try {
    // Initialize Canton client
    const canton = new Canton({ network: 'localnet' });

    console.log('📝 Creating party...');

    // Create the party using the utility function
    const result = await createParty({
      ledgerClient: canton.ledger,
      validatorClient: canton.validator,
      partyName,
      amount,
    });

    console.log('\n✅ Party created successfully!');
    console.log(`   Party ID: ${result.partyId}`);

    if (result.preapprovalContractId) {
      console.log(`   Preapproval Contract: ${result.preapprovalContractId.substring(0, 40)}...`);
      console.log('\n💡 This party can now receive pre-approved transfers!');
    } else {
      console.log('\n💡 No preapproval created (amount was 0)');
    }

    console.log('\n📚 What happened:');
    console.log('   1. Created a new user via Validator API');
    console.log('   2. Created a transfer offer to fund the party');
    console.log('   3. Accepted the transfer offer on behalf of the new party');
    console.log('   4. Waited for the transfer to settle (amulets available)');
    console.log('   5. Created a TransferPreapproval contract');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n💡 Common issues:');
    console.log('   - Make sure cn-quickstart is running');
    console.log('   - Ensure the validator has sufficient amulet balance');
    process.exit(1);
  }
}

void main();
