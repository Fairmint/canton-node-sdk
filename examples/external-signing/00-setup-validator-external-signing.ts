/**
 * Example 0: Setup Validator for External Signing
 *
 * This is a ONE-TIME setup script per validator/network that grants CanExecuteAsAnyParty
 * rights to the validator operator user. This allows the operator to execute externally
 * signed transactions for any party without needing to grant rights individually per party.
 *
 * ⚠️ IMPORTANT: This only needs to be run ONCE per validator/network setup.
 * After running this, all external party transactions will work without additional setup.
 *
 * Usage:
 *   npx tsx examples/external-signing/00-setup-validator-external-signing.ts
 *
 * Requirements:
 *   - Canton >= 3.1 (introduces CanExecuteAsAnyParty permission)
 *   - Admin credentials (ParticipantAdmin or IdentityProviderAdmin rights)
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../src';

async function main() {
  console.log('\n⚙️  Setting Up Validator for External Signing\n');

  // Step 1: Get validator operator user ID
  console.log('1️⃣  Getting validator operator user ID...');
  const validatorClient = new ValidatorApiClient();
  const validatorInfo = await validatorClient.getValidatorUserInfo();
  const userId = validatorInfo.user_name;

  console.log(`   ✓ User ID: ${userId}`);

  // Step 2: Grant CanExecuteAsAnyParty rights
  console.log('\n2️⃣  Granting CanExecuteAsAnyParty rights...');
  console.log(`   - This allows user "${userId}" to execute transactions for any party`);
  console.log('   - Required for external signing with multiple parties');

  const ledgerClient = new LedgerJsonApiClient();

  try {
    await ledgerClient.grantUserRights({
      userId,
      rights: [
        {
          kind: {
            CanExecuteAsAnyParty: {
              value: {},
            },
          },
        },
      ],
      identityProviderId: 'default',
    });

    console.log('   ✓ Rights granted successfully!');

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SUCCESS! Validator Configured for External Signing');
    console.log('═'.repeat(70));
    console.log('\n📋 What This Means:\n');
    console.log(`   • User "${userId}" can now execute transactions for ANY party`);
    console.log('   • External parties can prepare and execute transactions');
    console.log('   • No need to grant rights for each external party individually');
    console.log('   • This setup only needs to be done ONCE per validator');
    console.log('\n💡 Next Steps:\n');
    console.log('   1. Allocate external parties:');
    console.log('      npx tsx examples/external-signing/01-allocate-external-party.ts alice');
    console.log('');
    console.log('   2. Skip step 02 (no longer needed with CanExecuteAsAnyParty)');
    console.log('');
    console.log('   3. Create and accept transfers:');
    console.log('      npx tsx examples/external-signing/03-create-transfer-offer.ts ../keys/alice--<fingerprint>.json 10.0');
    console.log('      npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--<fingerprint>.json');
    console.log('');
  } catch (error: any) {
    if (error.status === 403) {
      console.log('   ❌ Permission denied (HTTP 403)');
      console.log('\n' + '═'.repeat(70));
      console.log('⚠️  ADMIN CREDENTIALS REQUIRED');
      console.log('═'.repeat(70));
      console.log('\nThis setup requires ParticipantAdmin or IdentityProviderAdmin permissions.');
      console.log('Your current credentials do not have sufficient permissions.\n');
      console.log('📋 Options:\n');
      console.log('1. Run this script with admin credentials:');
      console.log('   export LEDGER_JSON_API_TOKEN="<admin-token>"');
      console.log(`   npx tsx examples/external-signing/00-setup-validator-external-signing.ts`);
      console.log('');
      console.log('2. Contact your Canton administrator to run:');
      console.log('   ```typescript');
      console.log('   await ledgerClient.grantUserRights({');
      console.log(`     userId: "${userId}",`);
      console.log('     rights: [{');
      console.log('       kind: {');
      console.log('         CanExecuteAsAnyParty: {}');
      console.log('       }');
      console.log('     }],');
      console.log('     identityProviderId: "default"');
      console.log('   });');
      console.log('   ```');
      console.log('');
      process.exit(1);
    } else if (error.status === 400 && error.response?.includes?.('CanExecuteAsAnyParty')) {
      console.log('   ❌ CanExecuteAsAnyParty not supported');
      console.log('\n' + '═'.repeat(70));
      console.log('⚠️  CANTON VERSION TOO OLD');
      console.log('═'.repeat(70));
      console.log('\nThe CanExecuteAsAnyParty permission requires Canton >= 3.1');
      console.log('Your Canton network appears to be running an older version.\n');
      console.log('📋 Options:\n');
      console.log('1. Upgrade Canton to version 3.1 or later');
      console.log('');
      console.log('2. Fall back to per-party rights granting:');
      console.log('   For each external party, run:');
      console.log('   npx tsx examples/external-signing/02-grant-external-party-read-rights.ts <key-file>');
      console.log('');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Error setting up external signing:', error);
  if (error.response) {
    console.error('Details:', error.status, error.statusText);
    console.error('Response:', JSON.stringify(error.response, null, 2));
  }
  process.exit(1);
});
