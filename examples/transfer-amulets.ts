#!/usr/bin/env tsx
/**
 * Example: Transfer Amulets via Transfer Offer
 *
 * Demonstrates how to transfer amulets between parties using transfer offers.
 * This is the standard way to transfer amulets when the recipient needs to
 * explicitly accept the transfer.
 *
 * Prerequisites:
 * - cn-quickstart running with OAuth2 enabled
 * - Both sender and receiver parties exist
 *
 * Usage: npx tsx examples/transfer-amulets.ts <receiver-party-id> <amount>
 */

import { Canton, createTransferOffer, acceptTransferOffer } from '../src';

async function main(): Promise<void> {
  const receiverPartyId = process.argv[2];
  const amount = process.argv[3] ?? '1';

  if (!receiverPartyId) {
    console.log('Usage: npx tsx examples/transfer-amulets.ts <receiver-party-id> [amount]');
    console.log('\nExample:');
    console.log('  npx tsx examples/transfer-amulets.ts alice::12345... 10');
    process.exit(1);
  }

  console.log('💸 Transfer Amulets Example\n');
  console.log(`   Receiver: ${receiverPartyId.substring(0, 30)}...`);
  console.log(`   Amount: ${amount} amulets\n`);

  try {
    const canton = new Canton({ network: 'localnet' });

    // Step 1: Create a transfer offer
    console.log('📝 Creating transfer offer...');
    const transferOfferContractId = await createTransferOffer({
      ledgerClient: canton.ledger,
      receiverPartyId,
      amount,
      description: `Example transfer of ${amount} amulets`,
    });

    console.log(`   ✅ Offer created: ${transferOfferContractId.substring(0, 40)}...`);

    // Step 2: Accept the transfer offer (as the receiver)
    console.log('\n🤝 Accepting transfer offer...');
    await acceptTransferOffer({
      ledgerClient: canton.ledger,
      transferOfferContractId,
      acceptingPartyId: receiverPartyId,
    });

    console.log('   ✅ Transfer complete!');

    console.log('\n📚 Transfer Offer Flow:');
    console.log('   1. Sender creates a TransferOffer contract');
    console.log('   2. Receiver exercises TransferOffer_Accept');
    console.log('   3. Amulets are transferred from sender to receiver');
    console.log('   4. TransferOffer contract is archived');

    console.log('\n💡 For faster transfers, use TransferPreapproval:');
    console.log('   - Receiver creates a preapproval contract once');
    console.log('   - Sender can transfer directly without acceptance');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
