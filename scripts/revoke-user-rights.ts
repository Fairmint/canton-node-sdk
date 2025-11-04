#!/usr/bin/env tsx
import 'dotenv/config';
import { EnvLoader, LedgerJsonApiClient, ValidatorApiClient } from '../src';
import type { NetworkType } from '../src/core/types';

/** Create party-specific rights with value wrapper for revoke operation */
function createPartyRightsForRevoke(partyId: string): any[] {
  return [
    {
      kind: {
        CanActAs: { value: { party: partyId } },
      },
    },
  ];
}

/** Create admin rights with value wrapper for revoke operation */
function createAdminRightsForRevoke(): any[] {
  return [
    {
      kind: {
        ParticipantAdmin: { value: {} },
      },
    },
  ];
}

/** Create CanExecuteAsAnyParty rights with value wrapper for revoke operation */
function createExecuteAsAnyPartyRightsForRevoke(): any[] {
  return [
    {
      kind: {
        CanExecuteAsAnyParty: { value: {} },
      },
    },
  ];
}

/** Create CanReadAsAnyParty rights with value wrapper for revoke operation */
function createReadAsAnyPartyRightsForRevoke(): any[] {
  return [
    {
      kind: {
        CanReadAsAnyParty: { value: {} },
      },
    },
  ];
}

async function main(): Promise<void> {
  console.log('=== Revoke User Rights Utility ===\n');

  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: tsx scripts/revoke-user-rights.ts [options]

Options:
  --user-id <id>              User ID to revoke rights from (defaults to authenticated user)
  --party-id <id>             Party ID for party-specific rights (optional)
  --admin                     Revoke ParticipantAdmin rights
  --execute-any-party         Revoke CanExecuteAsAnyParty rights
  --read-any-party            Revoke CanReadAsAnyParty rights
  --network <network>         Target network (devnet|testnet|mainnet, defaults to CANTON_CURRENT_NETWORK)
  --provider <provider>       Target provider (defaults to CANTON_CURRENT_PROVIDER)
  --help, -h                  Show this help message

Examples:
  # Revoke admin rights from authenticated user (uses current network/provider from env)
  npm run revoke-user-rights -- --admin

  # Revoke CanExecuteAsAnyParty rights from authenticated user
  npm run revoke-user-rights -- --execute-any-party

  # Revoke CanReadAsAnyParty rights from authenticated user
  npm run revoke-user-rights -- --read-any-party

  # Revoke admin rights from specific user on devnet/intellect
  npm run revoke-user-rights -- --user-id "5" --admin --network devnet --provider intellect

  # Revoke party rights from authenticated user
  npm run revoke-user-rights -- --party-id "alice::party1"
    `);
    process.exit(0);
  }

  // Parse arguments
  const userIdIndex = args.indexOf('--user-id');
  const targetUserId = userIdIndex !== -1 ? args[userIdIndex + 1] : undefined;

  const partyIdIndex = args.indexOf('--party-id');
  const partyId = partyIdIndex !== -1 ? args[partyIdIndex + 1] : undefined;

  const admin = args.includes('--admin');
  const executeAnyParty = args.includes('--execute-any-party');
  const readAnyParty = args.includes('--read-any-party');

  const networkIndex = args.indexOf('--network');
  const network = networkIndex !== -1 ? (args[networkIndex + 1] as NetworkType) : undefined;

  const providerIndex = args.indexOf('--provider');
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;

  // Determine which rights to revoke
  let rights: any[];
  let rightsType: string;

  if (partyId) {
    rights = createPartyRightsForRevoke(partyId);
    rightsType = 'Party Rights (CanActAs)';
  } else if (executeAnyParty) {
    rights = createExecuteAsAnyPartyRightsForRevoke();
    rightsType = 'CanExecuteAsAnyParty';
  } else if (readAnyParty) {
    rights = createReadAsAnyPartyRightsForRevoke();
    rightsType = 'CanReadAsAnyParty';
  } else if (admin) {
    rights = createAdminRightsForRevoke();
    rightsType = 'ParticipantAdmin';
  } else {
    console.error(
      'Error: You must specify which rights to revoke (--admin, --execute-any-party, --read-any-party, or --party-id)'
    );
    process.exit(1);
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

    console.log(`\nRights to revoke: ${JSON.stringify(rights, null, 2)}`);

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

    // Revoke the rights
    console.log('\nRevoking rights...');
    const result = await client.revokeUserRights({
      userId: resolvedUserId,
      rights,
    });

    console.log(`\n✓ Successfully revoked ${result.newlyRevokedRights?.length ?? 0} rights`);
    if (result.newlyRevokedRights && result.newlyRevokedRights.length > 0) {
      console.log(`\nNewly revoked rights:`);
      console.log(JSON.stringify(result.newlyRevokedRights, null, 2));
    } else {
      console.log('\n(No rights were revoked - they may not have existed)');
    }

    // Verify by listing rights again
    console.log('\nVerifying...');
    const finalRights = await client.listUserRights({
      userId: resolvedUserId,
    });
    console.log(`Final rights count: ${finalRights.rights?.length ?? 0}`);

    console.log('\n✓ Done!');
  } catch (error) {
    console.error('\n✗ Failed to revoke rights:');
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
