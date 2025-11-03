/**
 * Example 4: Accept Transfer Offer with External Signing
 *
 * This example demonstrates the external signing workflow for accepting a transfer offer:
 * 1. Load the external party's Privy wallet info from file
 * 2. Load the transfer offer info (created by example 03)
 * 3. Prepare a transaction to accept the offer
 * 4. Sign the transaction via Privy
 * 5. Execute the signed transaction
 *
 * Usage:
 *   npx tsx examples/external-signing/04-accept-transfer-offer.ts <party-id-file> [network] [provider]
 *
 * Arguments:
 *   party-id-file  Path to the key file (required)
 *   network        Network to use: 'devnet' or 'mainnet' (optional, defaults to value in key file)
 *   provider       Provider to use: '5n' or 'intellect' (optional, defaults to value in key file)
 *
 * Examples:
 *   npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--12abc.json
 *   npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--12abc.json devnet 5n
 *
 * Note: Run examples 01, 02, and 03 first!
 *
 * Environment variables required:
 *   PRIVY_APP_ID      - Your Privy App ID
 *   PRIVY_APP_SECRET  - Your Privy App Secret
 */

import {
  LedgerJsonApiClient,
  ValidatorApiClient,
  prepareExternalTransaction,
  executeExternalTransaction,
  signWithPrivyWallet,
  createPrivyClientFromEnv,
  EnvLoader,
  FileLogger,
  type ClientConfig,
} from '../../src';
import * as fs from 'fs';
import * as path from 'path';

interface KeyData {
  partyName: string;
  partyId: string;
  userId: string;
  walletId: string;
  stellarAddress: string;
  publicKey: string;
  publicKeyFingerprint: string;
  synchronizerId: string;
  network: string;
  provider: string;
  createdAt: string;
}

interface OfferData {
  contractId: string;
  amount: string;
  receiverPartyId: string;
  createdAt: string;
}

function createLedgerClient(network: string, provider: string): LedgerJsonApiClient {
  const envLoader = EnvLoader.getInstance();
  return new LedgerJsonApiClient({
    network: network as any,
    provider: provider as any,
    authUrl: envLoader.getAuthUrl(network as any, provider as any),
    apis: {
      LEDGER_JSON_API: {
        apiUrl: envLoader.getApiUri('LEDGER_JSON_API', network as any, provider as any) ?? '',
        auth: {
          clientId: envLoader.getApiClientId('LEDGER_JSON_API', network as any, provider as any) ?? '',
          clientSecret: envLoader.getApiClientSecret('LEDGER_JSON_API', network as any, provider as any) ?? '',
          grantType: 'client_credentials',
        },
        partyId: envLoader.getPartyId(network as any, provider as any),
      },
    },
    logger: new FileLogger(),
  });
}

function createValidatorClient(network: string, provider: string): ValidatorApiClient {
  const envLoader = EnvLoader.getInstance();
  const apiUrl = envLoader.getApiUri('VALIDATOR_API', network as any, provider as any);
  const clientId = envLoader.getApiClientId('VALIDATOR_API', network as any, provider as any);
  const clientSecret = envLoader.getApiClientSecret('VALIDATOR_API', network as any, provider as any);
  const authUrl = envLoader.getAuthUrl(network as any, provider as any);
  const partyId = envLoader.getPartyId(network as any, provider as any);
  const userId = envLoader.getUserId(network as any, provider as any);
  const username = envLoader.getApiUsername('VALIDATOR_API', network as any, provider as any);
  const password = envLoader.getApiPassword('VALIDATOR_API', network as any, provider as any);

  if (!apiUrl || !authUrl) {
    throw new Error('Missing required environment configuration for ValidatorApiClient');
  }

  // Validate authentication method
  const hasClientCredentials = clientId && clientSecret;
  const hasPasswordGrant = username && password && clientId;

  if (!hasClientCredentials && !hasPasswordGrant) {
    throw new Error('Must provide either clientId+clientSecret or clientId+username+password');
  }

  const validatorApiConfig = {
    apiUrl,
    auth: hasClientCredentials
      ? {
          grantType: 'client_credentials',
          clientId,
          clientSecret,
        }
      : {
          grantType: 'password',
          clientId,
          username: username!,
          password: password!,
        },
    partyId,
    ...(userId && { userId }),
  };

  const clientConfig: ClientConfig = {
    network: network as any,
    provider: provider as any,
    authUrl,
    apis: {
      VALIDATOR_API: validatorApiConfig as any,
    },
    logger: new FileLogger(),
  };

  return new ValidatorApiClient(clientConfig);
}

async function main() {
  // Get command line arguments
  const keyFilePath = process.argv[2];

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: npx tsx 04-accept-transfer-offer.ts <key-file> [network] [provider]');
    console.error('Example: npx tsx 04-accept-transfer-offer.ts ../keys/alice--12abc.json');
    console.error('Example: npx tsx 04-accept-transfer-offer.ts ../keys/alice--12abc.json devnet 5n');
    process.exit(1);
  }

  // Step 1: Load wallet info from file
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

  // Get network and provider from command line or key file
  const network = process.argv[3] || keyData.network;
  const provider = process.argv[4] || keyData.provider;

  // Validate network and provider
  if (!['devnet', 'mainnet'].includes(network)) {
    console.error(`❌ Invalid network: ${network}. Must be 'devnet' or 'mainnet'`);
    process.exit(1);
  }

  if (!['5n', 'intellect'].includes(provider)) {
    console.error(`❌ Invalid provider: ${provider}. Must be '5n' or 'intellect'`);
    process.exit(1);
  }

  console.log(`   ✓ Party Name: ${keyData.partyName}`);
  console.log(`   ✓ Party ID: ${keyData.partyId}`);
  console.log(`   ✓ Wallet ID: ${keyData.walletId}`);
  console.log(`   ✓ Network: ${network}`);
  console.log(`   ✓ Provider: ${provider}`);

  // Initialize Privy client
  const privyClient = createPrivyClientFromEnv();
  console.log(`   ✓ Privy client initialized`);

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

  // Step 3: Initialize Canton clients
  console.log('\n3️⃣  Initializing Canton clients...');
  const ledgerClient = createLedgerClient(network, provider);
  const validatorClient = createValidatorClient(network, provider);
  console.log('   ✓ Clients initialized');

  // Step 3b: Get validator operator user ID
  console.log('\n3️⃣b Getting validator operator user ID...');
  const validatorInfo = await validatorClient.getValidatorUserInfo();
  const operatorUserId = validatorInfo.user_name;
  console.log(`   ✓ Operator User ID: ${operatorUserId}`);

  // Step 3c: Get current synchronizer ID from mining rounds
  console.log('\n3️⃣c Getting synchronizer ID...');
  const miningRounds = await validatorClient.getOpenAndIssuingMiningRounds();
  if (miningRounds.open_mining_rounds?.length === 0) {
    throw new Error('No open mining rounds found. Ensure the network is running.');
  }
  const synchronizerId = miningRounds.open_mining_rounds[0]?.domain_id;
  if (!synchronizerId) {
    throw new Error('No synchronizer ID found in mining rounds.');
  }
  console.log(`   ✓ Using synchronizer: ${synchronizerId}`);

  try {
    // Step 4: Fetch the transfer offer contract to disclose it
    console.log('\n4️⃣  Fetching transfer offer contract...');

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

    const commandId = `external-accept-${Date.now()}`;

    const prepared = await prepareExternalTransaction({
      ledgerClient,
      userId: operatorUserId,
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
      commandId,
      // Disclose the transfer offer contract so Canton can validate the transaction
      synchronizerId,
      disclosedContracts: [
        {
          templateId: activeContract.createdEvent.templateId,
          contractId: activeContract.createdEvent.contractId,
          createdEventBlob: activeContract.createdEvent.createdEventBlob,
          synchronizerId,
        },
      ],
    });

    console.log('   ✓ Transaction prepared');
    console.log(`   ✓ Hash: ${prepared.preparedTransactionHash.substring(0, 40)}...`);
    console.log(`   ✓ Hashing version: ${prepared.hashingSchemeVersion}`);

    // Validate that preparedTransaction was returned
    if (!prepared.preparedTransaction) {
      throw new Error('Prepared transaction is missing from response');
    }

    // Step 6: Sign the transaction hash via Privy
    console.log('\n6️⃣  Signing transaction hash via Privy...');
    const signature = await signWithPrivyWallet(
      privyClient,
      keyData.walletId,
      prepared.preparedTransactionHash
    );
    console.log(`   ✓ Signature: ${signature.substring(0, 40)}...`);

    // Step 7: Execute the signed transaction
    console.log('\n7️⃣  Submitting signed transaction to Canton...');
    const submissionId = `sub-${Date.now()}`;

    await executeExternalTransaction({
      ledgerClient,
      userId: operatorUserId,
      preparedTransaction: prepared.preparedTransaction,
      submissionId,
      partySignatures: [
        {
          party: keyData.partyId,
          signatures: [
            {
              format: 'SIGNATURE_FORMAT_RAW',
              signature,
              signedBy: keyData.publicKeyFingerprint,
              signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
            },
          ],
        },
      ],
      ...(prepared.hashingSchemeVersion && { hashingSchemeVersion: prepared.hashingSchemeVersion }),
      deduplicationPeriod: {
        DeduplicationDuration: {
          value: { duration: '30s' },
        },
      },
    });

    console.log('   ✓ Transaction submitted successfully!');

    // Step 8: Display results
    console.log(`\n${  '═'.repeat(70)}`);
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
    console.log('   1. Loaded external party wallet info and transfer offer');
    console.log('   2. Fetched the transfer offer contract from Canton');
    console.log('   3. Disclosed the contract and prepared the accept transaction');
    console.log('   4. Signed transaction hash via Privy API');
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
