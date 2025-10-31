/**
 * Example: Onboard an External Party
 *
 * This example demonstrates how to create an external party using a Stellar Ed25519 keypair.
 * The private key is generated locally and never leaves your control.
 *
 * Usage:
 *   ts-node examples/external-signing/01-onboard-external-party.ts <party-name> [user-id]
 *
 * Examples:
 *   ts-node examples/external-signing/01-onboard-external-party.ts alice
 *   ts-node examples/external-signing/01-onboard-external-party.ts alice user-12345
 *
 * Note: If /v2/authenticated-user endpoint returns 404, provide userId as second argument.
 */

import { Keypair } from '@stellar/stellar-base';
import { LedgerJsonApiClient, ValidatorApiClient, createExternalParty } from '../../src';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const partyName = process.argv[2] || 'alice';
  console.log(`\n🔐 Onboarding External Party: ${partyName}\n`);

  // Step 1: Generate a new Stellar Ed25519 keypair
  console.log('1️⃣  Generating Stellar Ed25519 keypair...');
  const keypair = Keypair.random();
  console.log(`   ✓ Public Key: ${keypair.publicKey()}`);
  console.log(`   ✓ Secret Key: ${keypair.secret()}`);

  // Step 2: Initialize Canton clients
  console.log('\n2️⃣  Initializing Canton clients...');
  const ledgerClient = new LedgerJsonApiClient();
  const validatorClient = new ValidatorApiClient();
  console.log('   ✓ Clients initialized');

  // Step 3: Get synchronizer ID from mining rounds
  console.log('\n3️⃣  Getting synchronizer ID...');
  const miningRounds = await validatorClient.getOpenAndIssuingMiningRounds();

  if (!miningRounds.open_mining_rounds || miningRounds.open_mining_rounds.length === 0) {
    throw new Error('No open mining rounds found. Ensure the network is running.');
  }

  const synchronizerId = miningRounds.open_mining_rounds[0]?.domain_id;
  if (!synchronizerId) {
    throw new Error('No synchronizer ID found in mining rounds.');
  }

  console.log(`   ✓ Using synchronizer: ${synchronizerId}`);

  // Step 4: Onboard the external party
  console.log('\n4️⃣  Onboarding party to Canton...');
  console.log('   - Generating topology transactions');
  console.log('   - Signing multi-hash with local keypair');
  console.log('   - Submitting to participant node');

  const party = await createExternalParty({
    ledgerClient,
    keypair,
    partyName,
    synchronizerId,
  });

  console.log('   ✓ Party successfully onboarded!');

  // Step 5: Save keys to file
  const keysDir = path.join(__dirname, '../../../keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  const safePartyId = party.partyId.replace(/::/g, '--');
  const keyFile = path.join(keysDir, `${safePartyId}.json`);

  const keyData = {
    partyName,
    partyId: party.partyId,
    userId: party.userId,
    stellarAddress: party.stellarAddress,
    stellarSecret: party.stellarSecret,
    publicKey: party.publicKey,
    publicKeyFingerprint: party.publicKeyFingerprint,
    synchronizerId,
    network: 'devnet',
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(keyFile, JSON.stringify(keyData, null, 2));

  // Step 6: Display results
  console.log('\n' + '═'.repeat(70));
  console.log('✅ SUCCESS! External Party Onboarded');
  console.log('═'.repeat(70));
  console.log(`\n📋 Party Details:`);
  console.log(`   Party Name:        ${partyName}`);
  console.log(`   Party ID:          ${party.partyId}`);
  console.log(`   Stellar Address:   ${party.stellarAddress}`);
  console.log(`   Stellar Secret:    ${party.stellarSecret}`);
  console.log(`   Public Key:        ${party.publicKey.substring(0, 40)}...`);
  console.log(`   Fingerprint:       ${party.publicKeyFingerprint}`);
  console.log(`\n💾 Keys saved to: ${keyFile}`);
  console.log('\n⚠️  IMPORTANT: Keep the keys file secure!');
  console.log('   The Stellar secret is needed for all future operations.');
  console.log('   Backup this file and never commit it to git.');
  console.log('');
}

main().catch((error) => {
  console.error('\n❌ Error onboarding party:', error);
  process.exit(1);
});
