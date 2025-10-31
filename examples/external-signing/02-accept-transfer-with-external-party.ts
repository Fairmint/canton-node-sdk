/**
 * Example: Accept Transfer Offer with External Signing
 *
 * This example demonstrates a complete external signing workflow:
 * 1. Create a transfer offer to the external party (using internal party)
 * 2. Load the external party's keypair from file
 * 3. Prepare a transaction to accept the offer
 * 4. Sign the transaction with the external key
 * 5. Execute the signed transaction
 *
 * Usage:
 *   ts-node examples/external-signing/02-accept-transfer-with-external-party.ts <party-id-file>
 *
 * Example:
 *   ts-node examples/external-signing/02-accept-transfer-with-external-party.ts keys/alice--12abc.json
 */

import { Keypair } from '@stellar/stellar-base';
import {
  LedgerJsonApiClient,
  ValidatorApiClient,
  prepareExternalTransaction,
  executeExternalTransaction,
  signWithStellarKeypair,
} from '../../src';
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
  // Get key file from command line
  const keyFilePath = process.argv[2];

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: ts-node 02-create-contract-with-external-party.ts <key-file>');
    console.error('Example: ts-node 02-create-contract-with-external-party.ts keys/alice--12abc.json');
    process.exit(1);
  }

  // Step 1: Load keypair from file
  console.log('\n🔑 Loading External Party Keys\n');
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

  // Step 2: Initialize Canton clients
  console.log('\n2️⃣  Initializing Canton clients...');
  const ledgerClient = new LedgerJsonApiClient();
  const validatorClient = new ValidatorApiClient();
  console.log('   ✓ Clients initialized');

  try {
    // Step 3: Create a transfer offer TO the external party (using internal party)
    console.log('\n3️⃣  Creating transfer offer to external party...');
    console.log('   - Offer amount: 10.0 CC');
    console.log('   - Recipient: External party');

    const transferOfferResponse = await validatorClient.createTransferOffer({
      receiver_party_id: keyData.partyId,
      amount: '10.0',
      description: 'Test transfer for external signing demo',
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    });

    const transferOfferContractId = transferOfferResponse.contract_id;
    console.log('   ✓ Transfer offer created');
    console.log(`   ✓ Contract ID: ${transferOfferContractId.substring(0, 40)}...`);

    // Step 4: Prepare transaction to accept the offer (using external party)
    console.log('\n4️⃣  Preparing transaction to accept offer...');
    console.log('   - External party will accept the transfer');
    console.log('   - Interpreting commands');
    console.log('   - Computing transaction hash');

    const commandId = `external-accept-${Date.now()}`;

    const prepared = await prepareExternalTransaction({
      ledgerClient,
      commands: [
        {
          ExerciseCommand: {
            templateId: '#splice-amulet:Splice.Amulet:TransferOffer',
            contractId: transferOfferContractId,
            choice: 'TransferOffer_Accept',
            choiceArgument: {},
          },
        },
      ],
      actAs: [keyData.partyId],
      commandId,
      synchronizerId: keyData.synchronizerId,
    });

    console.log('   ✓ Transaction prepared');
    console.log(`   ✓ Hash: ${prepared.preparedTransactionHash.substring(0, 40)}...`);
    console.log(`   ✓ Hashing version: ${prepared.hashingSchemeVersion}`);

    // Step 5: Sign the transaction hash with external key
    console.log('\n5️⃣  Signing transaction hash with external key...');
    const signature = signWithStellarKeypair(keypair, prepared.preparedTransactionHash);
    console.log(`   ✓ Signature: ${signature.substring(0, 40)}...`);

    // Step 6: Execute the signed transaction
    console.log('\n6️⃣  Submitting signed transaction to Canton...');
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

    // Step 7: Display results
    console.log('\n' + '═'.repeat(70));
    console.log('✅ SUCCESS! Transfer Accepted with External Signature');
    console.log('═'.repeat(70));
    console.log(`\n📋 Transaction Details:`);
    console.log(`   Transfer Amount:   10.0 CC`);
    console.log(`   Transfer Offer ID: ${transferOfferContractId.substring(0, 40)}...`);
    console.log(`   Command ID:        ${commandId}`);
    console.log(`   Submission ID:     ${submissionId}`);
    console.log(`   Party ID:          ${keyData.partyId}`);
    console.log(`   Signed By:         ${keyData.publicKeyFingerprint}`);
    console.log('\n💡 What Happened:');
    console.log('   1. Internal party created a transfer offer to the external party');
    console.log('   2. External party prepared the accept transaction');
    console.log('   3. Transaction was signed with external key (client-side)');
    console.log('   4. Signed transaction was submitted to Canton');
    console.log('   5. Validators verified the signature and executed the transfer');
    console.log('\n💰 The external party should now have 10.0 CC in their balance!');
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
