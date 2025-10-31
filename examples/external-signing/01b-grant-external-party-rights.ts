/**
 * Example: Grant Rights for External Party
 *
 * This script attempts to grant CanReadAs rights to the validator operator user
 * for an external party. This is required before the external party can prepare
 * transactions.
 *
 * Note: This requires admin permissions. If this fails with HTTP 403, you need
 * a Canton administrator to manually grant the rights.
 *
 * Usage:
 *   ts-node examples/external-signing/01b-grant-external-party-rights.ts <key-file>
 *
 * Example:
 *   ts-node examples/external-signing/01b-grant-external-party-rights.ts ../keys/alice--12abc.json
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../src';
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

async function main() {
  const keyFilePath = process.argv[2];

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: ts-node 01b-grant-external-party-rights.ts <key-file>');
    console.error('Example: ts-node 01b-grant-external-party-rights.ts ../keys/alice--12abc.json');
    process.exit(1);
  }

  console.log('\n🔐 Granting Rights for External Party\n');

  // Step 1: Load external party info
  console.log(`1️⃣  Reading key file: ${keyFilePath}`);

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

  // Step 2: Get validator operator user ID
  console.log('\n2️⃣  Getting validator operator user ID...');
  const validatorClient = new ValidatorApiClient();
  const validatorInfo = await validatorClient.getValidatorUserInfo();
  const userId = validatorInfo.user_name;

  console.log(`   ✓ User ID: ${userId}`);

  // Step 3: Attempt to grant CanReadAs rights
  console.log('\n3️⃣  Attempting to grant CanReadAs rights...');
  console.log(`   - Granting to user: ${userId}`);
  console.log(`   - For party: ${keyData.partyId}`);

  const ledgerClient = new LedgerJsonApiClient();

  try {
    await ledgerClient.grantUserRights({
      userId,
      rights: [
        {
          kind: {
            CanReadAs: {
              value: {
                party: keyData.partyId,
              },
            },
          },
        },
      ],
      identityProviderId: 'default',
    });

    console.log('   ✓ Rights granted successfully!');

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SUCCESS! Rights Granted');
    console.log('═'.repeat(70));
    console.log('\n💡 You can now proceed to accept the transfer offer:');
    console.log(`   npx tsx examples/external-signing/03-accept-transfer-offer.ts ${keyFilePath}`);
    console.log('');
  } catch (error: any) {
    if (error.status === 403) {
      console.log('   ❌ Permission denied (HTTP 403)');
      console.log('\n' + '═'.repeat(70));
      console.log('⚠️  ADMIN INTERVENTION REQUIRED');
      console.log('═'.repeat(70));
      console.log('\nThe validator operator user does not have permission to grant rights.');
      console.log('This is expected - granting rights requires admin permissions.\n');
      console.log('📋 Next Steps:\n');
      console.log('1. Contact your Canton administrator');
      console.log('2. Ask them to grant CanReadAs rights using:\n');
      console.log('   ```typescript');
      console.log('   await ledgerClient.grantUserRights({');
      console.log(`     userId: "${userId}",`);
      console.log('     rights: [{');
      console.log('       kind: {');
      console.log('         CanReadAs: {');
      console.log('           value: {');
      console.log(`             party: "${keyData.partyId}"`);
      console.log('           }');
      console.log('         }');
      console.log('       }');
      console.log('     }]');
      console.log('   });');
      console.log('   ```\n');
      console.log('3. Once rights are granted, proceed to step 3:');
      console.log(`   npx tsx examples/external-signing/03-accept-transfer-offer.ts ${keyFilePath}`);
      console.log('');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Error granting rights:', error);
  if (error.response) {
    console.error('Details:', error.status, error.statusText);
    console.error('Response:', JSON.stringify(error.response, null, 2));
  }
  process.exit(1);
});
