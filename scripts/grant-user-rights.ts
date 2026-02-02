#!/usr/bin/env tsx
import 'dotenv/config';
import { EnvLoader, LedgerJsonApiClient, ValidatorApiClient } from '../src';
import type { Right } from '../src/clients/ledger-json-api/schemas/api/users';
import type { NetworkType } from '../src/core/types';

/** Create default admin rights for a user Note: The grant API expects a nested "value" wrapper structure */
function createAdminRights(): Right[] {
  return [
    {
      kind: {
        ParticipantAdmin: { value: {} },
      },
    },
  ] as unknown as Right[];
}

/** Create CanExecuteAsAnyParty rights for a user Note: The grant API expects a nested "value" wrapper structure */
function createExecuteAsAnyPartyRights(): Right[] {
  return [
    {
      kind: {
        CanExecuteAsAnyParty: { value: {} },
      },
    },
  ] as unknown as Right[];
}

/** Create CanReadAsAnyParty rights for a user Note: The grant API expects a nested "value" wrapper structure */
function createReadAsAnyPartyRights(): Right[] {
  return [
    {
      kind: {
        CanReadAsAnyParty: { value: {} },
      },
    },
  ] as unknown as Right[];
}

/** Create party-specific rights for a user Note: The grant API expects a nested "value" wrapper structure */
function createPartyRights(partyId: string): Right[] {
  return [
    {
      kind: {
        CanActAs: { value: { party: partyId } },
      },
    },
    // {
    //   kind: {
    //     CanReadAs: { value: { party: partyId } },
    //   },
    // },
  ] as unknown as Right[];
}

async function main(): Promise<void> {
  console.log('=== Grant User Rights Utility ===\n');

  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: tsx scripts/grant-user-rights.ts [options]

Options:
  --user-id <id>              User ID to grant rights to (defaults to authenticated user)
  --party-id <id>             Party ID for party-specific rights (optional)
  --admin                     Grant ParticipantAdmin rights (default if no other right specified)
  --execute-any-party         Grant CanExecuteAsAnyParty rights
  --read-any-party            Grant CanReadAsAnyParty rights
  --network <network>         Target network (devnet|testnet|mainnet, defaults to CANTON_CURRENT_NETWORK)
  --provider <provider>       Target provider (defaults to CANTON_CURRENT_PROVIDER)
  --help, -h                  Show this help message

Examples:
  # Grant admin rights to authenticated user (uses current network/provider from env)
  npm run grant-user-rights -- --admin

  # Grant CanExecuteAsAnyParty rights to authenticated user
  npm run grant-user-rights -- --execute-any-party

  # Grant CanReadAsAnyParty rights to authenticated user
  npm run grant-user-rights -- --read-any-party

  # Grant admin rights to specific user on devnet/intellect
  npm run grant-user-rights -- --user-id "5" --admin --network devnet --provider intellect

  # Grant party rights to authenticated user
  npm run grant-user-rights -- --party-id "alice::party1"
    `);
    process.exit(0);
  }

  // Parse arguments
  const userIdIndex = args.indexOf('--user-id');
  const targetUserId = userIdIndex !== -1 ? args[userIdIndex + 1] : undefined;

  const partyIdIndex = args.indexOf('--party-id');
  const partyId = partyIdIndex !== -1 ? args[partyIdIndex + 1] : undefined;

  const executeAnyParty = args.includes('--execute-any-party');
  const readAnyParty = args.includes('--read-any-party');

  const networkIndex = args.indexOf('--network');
  const network = networkIndex !== -1 ? (args[networkIndex + 1] as NetworkType) : undefined;

  const providerIndex = args.indexOf('--provider');
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;

  // Determine which rights to grant
  let rights: Right[];
  let rightsType: string;

  if (partyId) {
    rights = createPartyRights(partyId);
    rightsType = 'Party Rights (CanActAs)';
  } else if (executeAnyParty) {
    rights = createExecuteAsAnyPartyRights();
    rightsType = 'CanExecuteAsAnyParty';
  } else if (readAnyParty) {
    rights = createReadAsAnyPartyRights();
    rightsType = 'CanReadAsAnyParty';
  } else {
    rights = createAdminRights();
    rightsType = 'ParticipantAdmin';
  }

  console.log('Configuration:');
  console.log(`  Network: ${network ?? 'from CANTON_CURRENT_NETWORK'}`);
  console.log(`  Provider: ${provider ?? 'from CANTON_CURRENT_PROVIDER'}`);
  if (targetUserId) {
    console.log(`  Target User ID: ${targetUserId}`);
  } else {
    console.log(`  Target User ID: <will auto-detect from authenticated user>`);
  }
  if (partyId) {
    console.log(`  Party ID: ${partyId}`);
  }
  console.log(`  Rights Type: ${rightsType}\n`);

  try {
    const configOptions = {
      ...(network !== undefined && { network }),
      ...(provider !== undefined && { provider }),
    };
    const client = new LedgerJsonApiClient(EnvLoader.getConfig('LEDGER_JSON_API', configOptions));
    const validatorClient = new ValidatorApiClient(EnvLoader.getConfig('VALIDATOR_API', configOptions));

    console.log(`Connected to Ledger JSON API`);

    // If no target user ID provided, get the authenticated user
    let resolvedUserId: string;
    if (!targetUserId) {
      console.log('Fetching authenticated user ID...');
      const authenticatedUser = await validatorClient.getValidatorUserInfo();
      resolvedUserId = authenticatedUser.user_name;
      console.log(`Using authenticated user: ${resolvedUserId}`);
    } else {
      resolvedUserId = targetUserId;
      console.log(`Target user: ${resolvedUserId}`);
    }

    console.log(`\nRights to grant: ${JSON.stringify(rights, null, 2)}`);

    // Check current rights
    console.log('\nChecking current rights...');
    try {
      const currentRights = await client.listUserRights({
        userId: resolvedUserId,
      });
      console.log(`Current rights count: ${currentRights.rights?.length ?? 0}`);
    } catch (error) {
      console.log(`Could not list current rights: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Grant the rights
    console.log('\nGranting rights...');
    // Note: Type assertion needed due to discrepancy between SDK's Right type
    // (from responses) and grantUserRights params schema (which expects value wrapper)
    const result = await client.grantUserRights({
      userId: resolvedUserId,
      rights: rights as unknown as Right[],
    });

    console.log(`\n✓ Successfully granted ${result.newlyGrantedRights?.length ?? 0} new rights`);
    if (result.newlyGrantedRights && result.newlyGrantedRights.length > 0) {
      console.log(`\nNewly granted rights:`);
      console.log(JSON.stringify(result.newlyGrantedRights, null, 2));
    } else {
      console.log('\n(Rights may have already existed)');
    }

    // Verify by listing rights again
    console.log('\nVerifying...');
    const finalRights = await client.listUserRights({
      userId: resolvedUserId,
    });
    console.log(`Final rights count: ${finalRights.rights?.length ?? 0}`);

    console.log('\n✓ Done!');
  } catch (error) {
    console.error('\n✗ Failed to grant rights:');
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
