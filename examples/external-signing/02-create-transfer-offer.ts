/**
 * Example: Create Transfer Offer to External Party
 *
 * This example demonstrates creating a transfer offer to an external party.
 * The offer is created by an internal party (with funds) and can be accepted
 * by the external party using example 03.
 *
 * Usage:
 *   ts-node examples/external-signing/02-create-transfer-offer.ts <party-id-file> [amount]
 *
 * Example:
 *   ts-node examples/external-signing/02-create-transfer-offer.ts keys/alice--12abc.json 10.0
 */

import { ValidatorApiClient } from '../../src';
import * as fs from 'fs';
import * as path from 'path';

interface KeyData {
  partyName: string;
  partyId: string;
  stellarAddress: string;
  stellarSecret: string;
  publicKey: string;
  publicKeyFingerprint: string;
  synchronizerId: string;
  network: string;
  createdAt: string;
}

async function main() {
  // Get parameters from command line
  const keyFilePath = process.argv[2];
  const amount = process.argv[3] || '10.0';

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: ts-node 02-create-transfer-offer.ts <key-file> [amount]');
    console.error('Example: ts-node 02-create-transfer-offer.ts keys/alice--12abc.json 10.0');
    process.exit(1);
  }

  // Step 1: Load external party info from file
  console.log('\n💰 Creating Transfer Offer to External Party\n');
  console.log(`1️⃣  Reading external party info: ${keyFilePath}`);

  const absolutePath = path.isAbsolute(keyFilePath)
    ? keyFilePath
    : path.join(process.cwd(), keyFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`\n❌ Error: Key file not found: ${absolutePath}`);
    process.exit(1);
  }

  const keyData: KeyData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

  console.log(`   ✓ Party Name: ${keyData.partyName}`);
  console.log(`   ✓ Party ID: ${keyData.partyId}`);

  // Step 2: Initialize Validator client
  console.log('\n2️⃣  Initializing Canton client...');
  const validatorClient = new ValidatorApiClient();
  console.log('   ✓ Client initialized');

  try {
    // Step 3: Create transfer offer to the external party
    console.log('\n3️⃣  Creating transfer offer...');
    console.log(`   - Amount: ${amount} CC`);
    console.log(`   - Recipient: ${keyData.partyId}`);
    console.log(`   - Expiry: 1 hour from now`);
    console.log(`   - Tracking ID: Will be generated`);

    const trackingId = `external-party-transfer-${Date.now()}`;

    const transferOfferResponse = await validatorClient.createTransferOffer({
      receiver_party_id: keyData.partyId,
      amount,
      description: 'Transfer to external party for signing demo',
      expires_at: (Date.now() + 3600000) * 1000, // 1 hour from now (timestamp in microseconds)
      tracking_id: trackingId,
    });

    const transferOfferContractId = transferOfferResponse.offer_contract_id;
    console.log('   ✓ Transfer offer created successfully!');
    console.log(`   ✓ Tracking ID: ${trackingId}`);

    // Step 4: Save the offer info for use in next example
    const offerFile = absolutePath.replace('.json', '-offer.json');
    const offerData = {
      contractId: transferOfferContractId,
      amount,
      receiverPartyId: keyData.partyId,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(offerFile, JSON.stringify(offerData, null, 2));

    // Step 5: Display results
    console.log('\n' + '═'.repeat(70));
    console.log('✅ SUCCESS! Transfer Offer Created');
    console.log('═'.repeat(70));
    console.log(`\n📋 Offer Details:`);
    console.log(`   Contract ID:   ${transferOfferContractId}`);
    console.log(`   Amount:        ${amount} CC`);
    console.log(`   Recipient:     ${keyData.partyId}`);
    console.log(`   Expires:       1 hour from now`);
    console.log(`\n💾 Offer info saved to: ${offerFile}`);
    console.log('\n💡 Next Step:');
    console.log(`   Accept this offer using:`);
    console.log(`   npx ts-node examples/external-signing/03-accept-transfer-offer.ts ${keyFilePath}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Error creating transfer offer:', error);
    if (error instanceof Error) {
      console.error('\nDetails:', error.message);
      if ('response' in error) {
        console.error('Response:', JSON.stringify((error as any).response, null, 2));
      }
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
