#!/usr/bin/env ts-node

import { ClientFactory } from '../../src/core/ClientFactory';
import {
  preApproveTransfers,
  transferToPreapproved,
} from '../../src/utils/amulet';

/**
 * Example script demonstrating pre-approved transfers
 *
 * Usage:
 *   ts-node scripts/examples/preApprovedTransfer.ts <receiver-party-id> <sender-party-id> <amount> [options]
 *
 * Options:
 *   --network <network>    Override CANTON_CURRENT_NETWORK (e.g., devnet, testnet)
 *   --provider <provider>  Override CANTON_CURRENT_PROVIDER (e.g., 5n, 10n)
 *
 * Examples:
 *   ts-node scripts/examples/preApprovedTransfer.ts party123 party456 100
 *   ts-node scripts/examples/preApprovedTransfer.ts party123 party456 100 --network devnet --provider 5n
 *
 * Environment variables required:
 *   - CANTON_CURRENT_NETWORK: Network to use (e.g., devnet) - can be overridden with --network
 *   - CANTON_CURRENT_PROVIDER: Provider to use (e.g., 5n) - can be overridden with --provider
 *   - CANTON_DEVNET_5N_LEDGER_JSON_API_URI: Ledger JSON API URI
 *   - CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID: Ledger JSON API client ID
 *   - CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET: Ledger JSON API client secret
 *   - CANTON_DEVNET_5N_VALIDATOR_API_URI: Validator API URI
 *   - CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_ID: Validator API client ID
 *   - CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_SECRET: Validator API client secret
 */

interface ScriptOptions {
  network?: string;
  provider?: string;
}

function parseCommandLineArgs(): { args: string[]; options: ScriptOptions } {
  const allArgs = process.argv.slice(2);
  const options: ScriptOptions = {};
  const args: string[] = [];

  for (let i = 0; i < allArgs.length; i++) {
    const arg = allArgs[i];

    if (!arg) continue;

    if (arg === '--network') {
      if (i + 1 < allArgs.length) {
        const networkValue = allArgs[i + 1];
        if (networkValue) {
          options.network = networkValue;
          i++; // Skip the next argument since we consumed it
        } else {
          console.error('Error: --network requires a value');
          process.exit(1);
        }
      } else {
        console.error('Error: --network requires a value');
        process.exit(1);
      }
    } else if (arg === '--provider') {
      if (i + 1 < allArgs.length) {
        const providerValue = allArgs[i + 1];
        if (providerValue) {
          options.provider = providerValue;
          i++; // Skip the next argument since we consumed it
        } else {
          console.error('Error: --provider requires a value');
          process.exit(1);
        }
      } else {
        console.error('Error: --provider requires a value');
        process.exit(1);
      }
    } else if (arg.startsWith('--')) {
      console.error(`Error: Unknown option ${arg}`);
      process.exit(1);
    } else {
      args.push(arg);
    }
  }

  return { args, options };
}

async function main(): Promise<void> {
  // Parse command line arguments and options
  const { args, options } = parseCommandLineArgs();

  if (args.length !== 3) {
    console.error(
      'Usage: ts-node scripts/examples/preApprovedTransfer.ts <receiver-party-id> <sender-party-id> <amount> [--network <network>] [--provider <provider>]'
    );
    process.exit(1);
  }

  const [receiverPartyId, senderPartyId, amount] = args;

  // Validate that all required arguments are provided
  if (!receiverPartyId || !senderPartyId || !amount) {
    console.error(
      'All arguments are required: receiver-party-id, sender-party-id, amount'
    );
    process.exit(1);
  }

  // Override environment variables if options are provided
  if (options.network) {
    process.env['CANTON_CURRENT_NETWORK'] = options.network;
    console.log(
      `🌐 Using network: ${options.network} (overridden from command line)`
    );
  }
  if (options.provider) {
    process.env['CANTON_CURRENT_PROVIDER'] = options.provider;
    console.log(
      `🔧 Using provider: ${options.provider} (overridden from command line)`
    );
  }

  console.log('🚀 Starting pre-approved transfer example...');
  console.log(`📥 Receiver Party ID: ${receiverPartyId}`);
  console.log(`📤 Sender Party ID: ${senderPartyId}`);
  console.log(`💰 Amount: ${amount}`);

  try {
    // Initialize clients
    console.log('\n🔧 Initializing clients...');

    // Import and register clients
    await import('../../src/clients/register');
    await import('../../src/clients/validator-api');

    // Get configuration from environment (will use overridden values if provided)
    const { EnvLoader } = await import('../../src/core/config');
    const ledgerConfig = EnvLoader.getConfig('LEDGER_JSON_API');
    const validatorConfig = EnvLoader.getConfig('VALIDATOR_API');

    const ledgerClient = ClientFactory.createClient(
      'LEDGER_JSON_API',
      ledgerConfig
    ) as import('../../src/clients/ledger-json-api').LedgerJsonApiClient;
    const validatorClient = ClientFactory.createClient(
      'VALIDATOR_API',
      validatorConfig
    ) as import('../../src/clients/validator-api').ValidatorApiClient;

    console.log('✅ Clients initialized successfully');

    // Query for amulet contracts for the parties
    console.log('\n🔍 Querying for amulet contracts...');
    try {
      const receiverAmulets = await validatorClient.getAmulets();
      console.log(
        `📊 Found ${receiverAmulets.amulets.length} amulet contracts for receiver`
      );
      console.log(
        '🔍 Amulet response structure:',
        JSON.stringify(receiverAmulets, null, 2)
      );

      if (receiverAmulets.amulets.length === 0) {
        console.error(
          '❌ No amulet contracts found for receiver. Cannot create pre-approval without amulet inputs.'
        );
        process.exit(1);
      }

      // Use the first amulet contract for the receiver
      const receiverAmuletContractId =
        receiverAmulets.amulets[0]?.contract?.contract?.contract_id;
      if (!receiverAmuletContractId) {
        console.error('❌ No valid amulet contract found for receiver');
        process.exit(1);
      }
      console.log(`✅ Using amulet contract: ${receiverAmuletContractId}`);

      // Get contract details for disclosed contracts
      console.log('\n🔍 Getting contract details for disclosed contracts...');
      const amuletRules = await validatorClient.getAmuletRules();
      const miningRounds =
        await validatorClient.getOpenAndIssuingMiningRounds();

      console.log(
        `📊 AmuletRules contract: ${amuletRules.amulet_rules.contract.contract_id}`
      );
      console.log(
        `📊 Open mining round: ${miningRounds.open_mining_rounds[0]?.contract?.contract_id}`
      );

      // Step 1: Create pre-approved transfers for the receiver
      console.log(
        '\n📋 Step 1: Creating pre-approved transfers for receiver...'
      );
      const preapprovalResult = await preApproveTransfers(
        ledgerClient,
        validatorClient,
        {
          receiverPartyId,
          providerPartyId: ledgerClient.getPartyId(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          inputs: [
            {
              tag: 'InputAmulet',
              value: receiverAmuletContractId,
            },
          ],
          contractDetails: {
            amuletRules: {
              createdEventBlob:
                amuletRules.amulet_rules.contract.created_event_blob,
              synchronizerId: amuletRules.amulet_rules.domain_id!,
            },
            openMiningRound: {
              createdEventBlob:
                miningRounds.open_mining_rounds[0]?.contract
                  ?.created_event_blob,
              synchronizerId: miningRounds.open_mining_rounds[0]?.domain_id,
            },
          },
        }
      );

      console.log(`✅ Pre-approved transfers created`);
      console.log(`   Contract ID: ${preapprovalResult.contractId}`);
      console.log(`   Domain ID: ${preapprovalResult.domainId}`);
      console.log(`   Amulet Paid: ${preapprovalResult.amuletPaid}`);

      // Query for sender amulet contracts
      const senderAmulets = await validatorClient.getAmulets();
      console.log(
        `📊 Found ${senderAmulets.amulets.length} amulet contracts for sender`
      );

      if (senderAmulets.amulets.length === 0) {
        console.error(
          '❌ No amulet contracts found for sender. Cannot perform transfer without amulet inputs.'
        );
        process.exit(1);
      }

      const senderAmuletContractId =
        senderAmulets.amulets[0]?.contract?.contract?.contract_id;
      if (!senderAmuletContractId) {
        console.error('❌ No valid amulet contract found for sender');
        process.exit(1);
      }
      console.log(`✅ Using sender amulet contract: ${senderAmuletContractId}`);

      // Step 2: Transfer coins from sender to receiver
      console.log(
        '\n💸 Step 2: Transferring coins to pre-approved receiver...'
      );
      const transferResult = await transferToPreapproved(
        ledgerClient,
        validatorClient,
        {
          senderPartyId,
          transferPreapprovalContractId: preapprovalResult.contractId,
          amount,
          description: 'Example transfer to pre-approved party',
          inputs: [
            {
              tag: 'InputAmulet',
              value: senderAmuletContractId,
            },
          ],
        }
      );

      console.log(`✅ Transfer completed successfully`);
      console.log(`   Contract ID: ${transferResult.contractId}`);
      console.log(`   Domain ID: ${transferResult.domainId}`);

      console.log('\n🎉 Pre-approved transfer example completed successfully!');
    } catch (error) {
      console.error('\n❌ Error during pre-approved transfer example:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error during pre-approved transfer example:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
