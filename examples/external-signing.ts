#!/usr/bin/env tsx
/**
 * Example: External Signing (User-Controlled Keys)
 *
 * Demonstrates how to create an external party where the private key is
 * controlled by the user (e.g., in a hardware wallet), not by the node.
 *
 * This is useful for:
 * - Hardware wallet integration
 * - Multi-signature schemes
 * - Self-custody wallets
 *
 * Prerequisites:
 * - cn-quickstart running with OAuth2 enabled
 *
 * Usage: npx tsx examples/external-signing.ts
 */

import { Keypair } from '@stellar/stellar-base';
import { Canton, createExternalParty } from '../src';

async function main(): Promise<void> {
  console.log('🔐 External Signing Example\n');

  try {
    const canton = new Canton({ network: 'localnet' });

    // Step 1: Generate a new keypair (in practice, this would be in a hardware wallet)
    console.log('🔑 Generating Ed25519 keypair...');
    const keypair = Keypair.random();
    console.log(`   Public key: ${keypair.publicKey().substring(0, 20)}...`);
    console.log(`   ⚠️  Keep the secret key secure!`);

    // Step 2: Get the synchronizer ID from the network
    console.log('\n📡 Getting synchronizer ID...');
    const dsoInfo = await canton.scan.getDsoInfo();
    const svNodeStates = dsoInfo.sv_node_states;
    const firstNodeState = svNodeStates?.[0];
    // The payload is stored in the contract's payload field as a Record<string, never> (generic JSON)
    const contractPayload = firstNodeState?.contract?.payload as Record<string, unknown> | undefined;
    const nodeState = contractPayload?.['state'] as Record<string, unknown> | undefined;
    const syncNodes = nodeState?.['synchronizerNodes'] as Record<string, unknown> | undefined;
    const syncNodesList = syncNodes?.['synchronizerNodes'] as Array<[string, unknown]> | undefined;
    const synchronizerId = syncNodesList?.[0]?.[0];

    if (!synchronizerId) {
      throw new Error('Could not determine synchronizer ID from DSO info');
    }
    console.log(`   Synchronizer: ${synchronizerId.substring(0, 30)}...`);

    // Step 3: Create the external party
    console.log('\n📝 Creating external party...');
    const result = await createExternalParty({
      ledgerClient: canton.ledger,
      keypair,
      partyName: `ext-party-${Date.now()}`,
      synchronizerId,
    });

    console.log('\n✅ External party created!');
    console.log(`   Party ID: ${result.partyId}`);
    console.log(`   Public Key Fingerprint: ${result.publicKeyFingerprint}`);
    console.log(`   Stellar Address: ${result.stellarAddress}`);

    console.log('\n📚 External Signing Flow:');
    console.log('   1. Generate keypair (Ed25519)');
    console.log('   2. Generate topology transactions for the party');
    console.log('   3. Sign the multi-hash with the private key');
    console.log('   4. Submit topology and allocate party on ledger');

    console.log('\n💡 To submit transactions as this party:');
    console.log('   1. Call prepareExternalTransaction() to get hash');
    console.log('   2. Sign hash with private key');
    console.log('   3. Call executeExternalTransaction() with signature');

    console.log('\n⚠️  Security Notes:');
    console.log('   - Store the Stellar secret key securely');
    console.log('   - Never expose the private key to the network');
    console.log('   - Consider using a hardware wallet for production');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
