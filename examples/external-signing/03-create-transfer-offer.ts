/**
 * Example 3: Create Transfer Offer to External Party
 *
 * This example demonstrates creating a transfer offer to an external party. The offer is created by an internal party
 * (with funds) and can be accepted by the external party using example 04.
 *
 * Usage: npx tsx examples/external-signing/03-create-transfer-offer.ts <party-id-file> [amount] [network] [provider]
 *
 * Arguments: party-id-file Path to the key file (required) amount Amount to transfer (optional, default: 10.0) network
 * Network to use: 'devnet' or 'mainnet' (optional, defaults to value in key file) provider Provider to use: '5n' or
 * 'intellect' (optional, defaults to value in key file)
 *
 * Examples: npx tsx examples/external-signing/03-create-transfer-offer.ts ../keys/alice--12abc.json 10.0 npx tsx
 * examples/external-signing/03-create-transfer-offer.ts ../keys/alice--12abc.json 10.0 devnet 5n
 */

import * as fs from 'fs';
import * as path from 'path';
import { EnvLoader, FileLogger, ValidatorApiClient, type ClientConfig, type NetworkType } from '../../src';

interface KeyData {
  partyName: string;
  partyId: string;
  walletId: string;
  stellarAddress: string;
  publicKey: string;
  publicKeyFingerprint: string;
  synchronizerId: string;
  network: string;
  provider: string;
  createdAt: string;
}

function createValidatorClient(network: string, provider: string): ValidatorApiClient {
  const envLoader = EnvLoader.getInstance();
  const networkType = network as NetworkType;
  const providerType = provider;
  const apiUrl = envLoader.getApiUri('VALIDATOR_API', networkType, providerType);
  const clientId = envLoader.getApiClientId('VALIDATOR_API', networkType, providerType);
  const clientSecret = envLoader.getApiClientSecret('VALIDATOR_API', networkType, providerType);
  const authUrl = envLoader.getAuthUrl(networkType, providerType);
  const partyId = envLoader.getPartyId(networkType, providerType);
  const userId = envLoader.getUserId(networkType, providerType);
  const username = envLoader.getApiUsername('VALIDATOR_API', networkType, providerType);
  const password = envLoader.getApiPassword('VALIDATOR_API', networkType, providerType);

  if (!apiUrl || !authUrl) {
    throw new Error('Missing required environment configuration for ValidatorApiClient');
  }

  // Validate authentication method
  const hasClientCredentials = clientId && clientSecret;
  const hasPasswordGrant = username && password && clientId;

  if (!hasClientCredentials && !hasPasswordGrant) {
    throw new Error('Must provide either clientId+clientSecret or clientId+username+password');
  }

  if (hasPasswordGrant && (!username || !password)) {
    throw new Error('Username and password are required for password grant');
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
          username: username ?? '',
          password: password ?? '',
        },
    partyId,
    ...(userId && { userId }),
  };

  const clientConfig: ClientConfig = {
    network: networkType,
    provider: providerType,
    authUrl,
    apis: {
      VALIDATOR_API: validatorApiConfig,
    },
    logger: new FileLogger(),
  };

  return new ValidatorApiClient(clientConfig);
}

async function main() {
  // Get parameters from command line
  const keyFilePath = process.argv[2];
  const amount = process.argv[3] ?? '10.0';

  if (!keyFilePath) {
    console.error('\n❌ Error: Please provide a key file path');
    console.error('Usage: npx tsx 03-create-transfer-offer.ts <key-file> [amount] [network] [provider]');
    console.error('Example: npx tsx 03-create-transfer-offer.ts ../keys/alice--12abc.json 10.0');
    console.error('Example: npx tsx 03-create-transfer-offer.ts ../keys/alice--12abc.json 10.0 devnet 5n');
    process.exit(1);
  }

  // Step 1: Load external party info from file
  console.log('\n💰 Creating Transfer Offer to External Party\n');
  console.log(`1️⃣  Reading external party info: ${keyFilePath}`);

  const absolutePath = path.isAbsolute(keyFilePath) ? keyFilePath : path.join(process.cwd(), keyFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`\n❌ Error: Key file not found: ${absolutePath}`);
    process.exit(1);
  }

  const keyData: KeyData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

  // Get network and provider from command line or key file
  const network = process.argv[4] ?? keyData.network;
  const provider = process.argv[5] ?? keyData.provider;

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
  console.log(`   ✓ Network: ${network}`);
  console.log(`   ✓ Provider: ${provider}`);

  // Step 2: Initialize Validator client
  console.log('\n2️⃣  Initializing Canton client...');
  const validatorClient = createValidatorClient(network, provider);
  console.log('   ✓ Client initialized');

  try {
    // Step 3: Create transfer offer to the external party
    console.log('\n3️⃣  Creating transfer offer...');
    console.log(`   - Amount: ${amount} CC`);
    console.log(`   - Recipient: ${keyData.partyId}`);
    console.log(`   - Expiry: 1 hour from now`);
    console.log(`   - Tracking ID: Will be generated`);

    const trackingId = `external-party-transfer-${Date.now()}`;

    const transferOfferResponse = await validatorClient.createTransferOffer({
      receiver_party_id: keyData.partyId,
      amount,
      description: 'Transfer to external party for signing demo',
      expires_at: (Date.now() + 3600000) * 1000, // 1 hour from now (timestamp in microseconds)
      tracking_id: trackingId,
    });

    const transferOfferContractId = transferOfferResponse.offer_contract_id;
    console.log('   ✓ Transfer offer created successfully!');
    console.log(`   ✓ Tracking ID: ${trackingId}`);

    // Step 4: Save the offer info for use in next example
    const offerFile = absolutePath.replace('.json', '-offer.json');
    const offerData = {
      contractId: transferOfferContractId,
      amount,
      receiverPartyId: keyData.partyId,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(offerFile, JSON.stringify(offerData, null, 2));

    // Step 5: Display results
    console.log(`\n${'═'.repeat(70)}`);
    console.log('✅ SUCCESS! Transfer Offer Created');
    console.log('═'.repeat(70));
    console.log(`\n📋 Offer Details:`);
    console.log(`   Contract ID:   ${transferOfferContractId}`);
    console.log(`   Amount:        ${amount} CC`);
    console.log(`   Recipient:     ${keyData.partyId}`);
    console.log(`   Expires:       1 hour from now`);
    console.log(`\n💾 Offer info saved to: ${offerFile}`);
    console.log('\n💡 Next Step:');
    console.log(`   Accept this offer using:`);
    console.log(`   npx tsx examples/external-signing/04-accept-transfer-offer.ts ${keyFilePath}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Error creating transfer offer:', error);
    if (error instanceof Error) {
      console.error('\nDetails:', error.message);
      if ('response' in error && error.response) {
        console.error('Response:', JSON.stringify(error.response, null, 2));
      }
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
