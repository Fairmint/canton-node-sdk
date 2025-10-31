/**
 * Example 4: Accept Transfer Offer with External Signing
 *
 * This example demonstrates the external signing workflow for accepting a transfer offer:
 * 1. Load the external party's keypair from file
 * 2. Load the transfer offer info (created by example 03)
 * 3. Prepare a transaction to accept the offer
 * 4. Sign the transaction with the external key
 * 5. Execute the signed transaction
 *
 * Usage:
 *   npx tsx examples/external-signing/04-accept-transfer-offer.ts <party-id-file>
 *
 * Example:
 *   npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--12abc.json
 *
 * Note: Run examples 01, 02, and 03 first!
 */

import { Keypair } from '@stellar/stellar-base';
import {
  LedgerJsonApiClient,
  prepareExternalTransaction,
  executeExternalTransaction,
  signWithStellarKeypair,
} from '../../src';
import * as fs from 'fs';
import * as path from 'path';

interface KeyData {
  partyName: string;
  partyId: string;
  userId: string;
  stellarAddress: string;
  stellarSecret: string;
  publicKey: string;
  publicKeyFingerprint: string;
  synchronizerId: string;
  network: string;
  createdAt: string;
}

interface OfferData {
  contractId: string;
  amount: string;
  receiverPartyId: string;
  createdAt: string;
}

async function main() {
  // Get key file from command line
  const keyFilePath = process.argv[2];

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: npx tsx 04-accept-transfer-offer.ts <key-file>');
    console.error('Example: npx tsx 04-accept-transfer-offer.ts ../keys/alice--12abc.json');
    process.exit(1);
  }

  // Step 1: Load keypair from file
  console.log('\n✍️  Accepting Transfer Offer with External Signing\n');
  console.log(`1️⃣  Reading key file: ${keyFilePath}`);

  const absolutePath = path.isAbsolute(keyFilePath)
    ? keyFilePath
    : path.join(process.cwd(), keyFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`\n❌ Error: Key file not found: ${absolutePath}`);
    process.exit(1);
  }

  const keyData: KeyData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  const keypair = Keypair.fromSecret(keyData.stellarSecret);

  console.log(`   ✓ Party Name: ${keyData.partyName}`);
  console.log(`   ✓ Party ID: ${keyData.partyId}`);
  console.log(`   ✓ Keypair loaded`);

  // Step 2: Load offer info from file
  console.log('\n2️⃣  Loading transfer offer info...');
  const offerFile = absolutePath.replace('.json', '-offer.json');

  if (!fs.existsSync(offerFile)) {
    console.error(`\n❌ Error: Offer file not found: ${offerFile}`);
    console.error('\n💡 Run example 02 first to create a transfer offer:');
    console.error(`   npx ts-node examples/external-signing/02-create-transfer-offer.ts ${keyFilePath}`);
    process.exit(1);
  }

  const offerData: OfferData = JSON.parse(fs.readFileSync(offerFile, 'utf-8'));
  console.log(`   ✓ Offer loaded`);
  console.log(`   ✓ Contract ID: ${offerData.contractId.substring(0, 40)}...`);
  console.log(`   ✓ Amount: ${offerData.amount} CC`);

  // Step 3: Initialize Canton client
  console.log('\n3️⃣  Initializing Canton client...');
  const ledgerClient = new LedgerJsonApiClient();
  console.log('   ✓ Client initialized');

  try {
    // Step 4: Fetch the transfer offer contract to disclose it
    console.log('\n4️⃣  Fetching transfer offer contract...');
    console.log(`   - Contract ID: ${offerData.contractId.substring(0, 40)}...`);

    const contractsResponse = await ledgerClient.getActiveContracts({
      templateIds: ['#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer'],
      includeCreatedEventBlob: true, // Required to get the createdEventBlob
    });

    // Find the contract in the response
    const contractItem = contractsResponse.find((item) => {
      if ('JsActiveContract' in item.contractEntry) {
        return item.contractEntry.JsActiveContract.createdEvent.contractId === offerData.contractId;
      }
      return false;
    });

    if (!contractItem || !('JsActiveContract' in contractItem.contractEntry)) {
      throw new Error(`Transfer offer contract not found: ${offerData.contractId}`);
    }

    const activeContract = contractItem.contractEntry.JsActiveContract;
    console.log('   ✓ Transfer offer contract fetched');

    // Step 5: Prepare transaction to accept the offer
    console.log('\n5️⃣  Preparing transaction to accept offer...');
    console.log('   - Disclosing transfer offer contract');
    console.log('   - Interpreting commands');
    console.log('   - Computing transaction hash');

    const commandId = `external-accept-${Date.now()}`;

    const prepared = await prepareExternalTransaction({
      ledgerClient,
      // userId is automatically fetched from validator API if not provided
      commands: [
        {
          ExerciseCommand: {
            templateId: '#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer',
            contractId: offerData.contractId,
            choice: 'TransferOffer_Accept',
            choiceArgument: {},
          },
        },
      ],
      actAs: [keyData.partyId],
      // Note: Don't set readAs - the validator operator user will read
      commandId,
      synchronizerId: keyData.synchronizerId,
      // Disclose the transfer offer contract so Canton can validate the transaction
      disclosedContracts: [
        {
          templateId: activeContract.createdEvent.templateId,
          contractId: activeContract.createdEvent.contractId,
          createdEventBlob: activeContract.createdEvent.createdEventBlob,
          synchronizerId: activeContract.synchronizerId,
        },
      ],
    });

    console.log('   ✓ Transaction prepared');
    console.log(`   ✓ Hash: ${prepared.preparedTransactionHash.substring(0, 40)}...`);
    console.log(`   ✓ Hashing version: ${prepared.hashingSchemeVersion}`);

    // Step 6: Sign the transaction hash with external key
    console.log('\n6️⃣  Signing transaction hash with external key...');
    const signature = signWithStellarKeypair(keypair, prepared.preparedTransactionHash);
    console.log(`   ✓ Signature: ${signature.substring(0, 40)}...`);

    // Step 7: Execute the signed transaction
    console.log('\n7️⃣  Submitting signed transaction to Canton...');
    const submissionId = `sub-${Date.now()}`;

    await executeExternalTransaction({
      ledgerClient,
      preparedTransaction: prepared.preparedTransaction,
      partyId: keyData.partyId,
      signature,
      publicKeyFingerprint: keyData.publicKeyFingerprint,
      submissionId,
      hashingSchemeVersion: prepared.hashingSchemeVersion,
      deduplicationPeriod: {
        DeduplicationDuration: { duration: '30s' },
      },
    });

    console.log('   ✓ Transaction submitted successfully!');

    // Step 8: Display results
    console.log('\n' + '═'.repeat(70));
    console.log('✅ SUCCESS! Transfer Accepted with External Signature');
    console.log('═'.repeat(70));
    console.log(`\n📋 Transaction Details:`);
    console.log(`   Transfer Amount:   ${offerData.amount} CC`);
    console.log(`   Transfer Offer ID: ${offerData.contractId.substring(0, 40)}...`);
    console.log(`   Command ID:        ${commandId}`);
    console.log(`   Submission ID:     ${submissionId}`);
    console.log(`   Party ID:          ${keyData.partyId}`);
    console.log(`   Signed By:         ${keyData.publicKeyFingerprint}`);
    console.log('\n💡 What Happened:');
    console.log('   1. Loaded external party keypair and transfer offer info');
    console.log('   2. Fetched the transfer offer contract from Canton');
    console.log('   3. Disclosed the contract and prepared the accept transaction');
    console.log('   4. Signed transaction hash with external key (client-side)');
    console.log('   5. Submitted signed transaction to Canton');
    console.log('   6. Canton validators verified the signature and executed the transfer');
    console.log(`\n💰 The external party now has ${offerData.amount} CC in their balance!`);
    console.log('');

    // Clean up the offer file after successful acceptance
    fs.unlinkSync(offerFile);
    console.log(`🗑️  Offer file cleaned up: ${offerFile}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error);
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
