/**
 * Example 1: Allocate External Party
 *
 * This example demonstrates how to allocate (onboard) an external party using Privy for key management. The wallet is
 * created via Privy and signing happens through their secure API.
 *
 * Usage: npx tsx examples/external-signing/01-allocate-external-party.ts <party-name> [network] [provider]
 *
 * Arguments: party-name Name for the party (default: 'alice') network Network to use: 'devnet' or 'mainnet' (default:
 * 'devnet') provider Provider to use: '5n' or 'intellect' (default: '5n')
 *
 * Examples: npx tsx examples/external-signing/01-allocate-external-party.ts alice npx tsx
 * examples/external-signing/01-allocate-external-party.ts alice devnet 5n npx tsx
 * examples/external-signing/01-allocate-external-party.ts alice mainnet intellect
 *
 * Environment variables required: PRIVY_APP_ID - Your Privy App ID PRIVY_APP_SECRET - Your Privy App Secret
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createExternalPartyPrivy,
  createPrivyClientFromEnv,
  EnvLoader,
  FileLogger,
  LedgerJsonApiClient,
  ValidatorApiClient,
  type ClientConfig,
  type NetworkType,
} from '../../src';

function printUsage(): void {
  console.log('\nUsage:');
  console.log('  npx tsx examples/external-signing/01-allocate-external-party.ts <party-name> [network] [provider]');
  console.log('\nArguments:');
  console.log('  party-name  Name for the party (default: alice)');
  console.log('  network     Network: devnet or mainnet (default: devnet)');
  console.log('  provider    Provider: 5n or intellect (default: 5n)');
  console.log('\nExamples:');
  console.log('  npx tsx examples/external-signing/01-allocate-external-party.ts alice');
  console.log('  npx tsx examples/external-signing/01-allocate-external-party.ts alice devnet 5n');
  console.log('  npx tsx examples/external-signing/01-allocate-external-party.ts alice mainnet intellect\n');
}

function createLedgerClient(network: string, provider: string): LedgerJsonApiClient {
  const envLoader = EnvLoader.getInstance();
  const networkType = network as NetworkType;
  const providerType = provider;
  return new LedgerJsonApiClient({
    network: networkType,
    provider: providerType,
    authUrl: envLoader.getAuthUrl(networkType, providerType),
    apis: {
      LEDGER_JSON_API: {
        apiUrl: envLoader.getApiUri('LEDGER_JSON_API', networkType, providerType) ?? '',
        auth: {
          clientId: envLoader.getApiClientId('LEDGER_JSON_API', networkType, providerType) ?? '',
          clientSecret: envLoader.getApiClientSecret('LEDGER_JSON_API', networkType, providerType) ?? '',
          grantType: 'client_credentials',
        },
        partyId: envLoader.getPartyId(networkType, providerType),
      },
    },
    logger: new FileLogger(),
  });
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
  const partyName = process.argv[2] ?? 'alice';
  const network = process.argv[3] ?? 'devnet';
  const provider = process.argv[4] ?? '5n';

  // Validate network and provider
  if (!['devnet', 'mainnet'].includes(network)) {
    console.error(`❌ Invalid network: ${network}. Must be 'devnet' or 'mainnet'`);
    printUsage();
    process.exit(1);
  }

  if (!['5n', 'intellect'].includes(provider)) {
    console.error(`❌ Invalid provider: ${provider}. Must be '5n' or 'intellect'`);
    printUsage();
    process.exit(1);
  }

  console.log(`\n🔐 Onboarding External Party: ${partyName}`);
  console.log(`📡 Network: ${network}, Provider: ${provider}\n`);

  // Step 1: Initialize Privy client
  console.log('1️⃣  Initializing Privy client...');
  const privyClient = createPrivyClientFromEnv();
  console.log('   ✓ Privy client initialized');

  // Step 2: Initialize Canton clients
  console.log('\n2️⃣  Initializing Canton clients...');
  const ledgerClient = createLedgerClient(network, provider);
  const validatorClient = createValidatorClient(network, provider);
  console.log('   ✓ Clients initialized');

  // Step 3: Get synchronizer ID from mining rounds
  console.log('\n3️⃣  Getting synchronizer ID...');
  const miningRounds = await validatorClient.getOpenAndIssuingMiningRounds();

  if (!miningRounds.open_mining_rounds || miningRounds.open_mining_rounds.length === 0) {
    throw new Error('No open mining rounds found. Ensure the network is running.');
  }

  const synchronizerId = miningRounds.open_mining_rounds[0].domain_id;
  if (!synchronizerId) {
    throw new Error('No synchronizer ID found in mining rounds.');
  }

  console.log(`   ✓ Using synchronizer: ${synchronizerId}`);

  // Step 4: Onboard the external party
  console.log('\n4️⃣  Onboarding party to Canton...');
  console.log('   - Creating Privy wallet');
  console.log('   - Generating topology transactions');
  console.log('   - Signing via Privy API');
  console.log('   - Submitting to participant node');

  const party = await createExternalPartyPrivy({
    privyClient,
    ledgerClient,
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
    walletId: party.wallet.id,
    stellarAddress: party.wallet.address,
    publicKey: party.publicKey,
    publicKeyFingerprint: party.publicKeyFingerprint,
    synchronizerId,
    network,
    provider,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(keyFile, JSON.stringify(keyData, null, 2));

  // Step 6: Display results
  console.log(`\n${'═'.repeat(70)}`);
  console.log('✅ SUCCESS! External Party Onboarded');
  console.log('═'.repeat(70));
  console.log(`\n📋 Party Details:`);
  console.log(`   Party Name:        ${partyName}`);
  console.log(`   Party ID:          ${party.partyId}`);
  console.log(`   Network:           ${network}`);
  console.log(`   Provider:          ${provider}`);
  console.log(`   Privy Wallet ID:   ${party.wallet.id}`);
  console.log(`   Stellar Address:   ${party.wallet.address}`);
  console.log(`   Public Key:        ${party.publicKey.substring(0, 40)}...`);
  console.log(`   Fingerprint:       ${party.publicKeyFingerprint}`);
  console.log(`\n💾 Keys saved to: ${keyFile}`);
  console.log('\n⚠️  IMPORTANT: Keep the keys file secure!');
  console.log('   The Privy wallet ID is needed for all future signing operations.');
  console.log('   Backup this file and never commit it to git.');
  console.log('');
}

main().catch((error) => {
  console.error('\n❌ Error onboarding party:', error);
  process.exit(1);
});
