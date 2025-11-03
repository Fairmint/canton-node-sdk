/**
 * Canton Party Generation from Privy Stellar Wallet Example
 *
 * This example demonstrates how to use a Privy-managed Stellar wallet to generate a Canton Network party ID (external
 * party). This is useful for:
 *
 * - Creating Canton parties controlled by Privy embedded wallets
 * - Allowing users to interact with Canton Network using their Privy wallet
 * - Maintaining custody of Canton party keys through Privy
 *
 * The Process:
 *
 * 1. Create or retrieve a Stellar wallet from Privy
 * 2. Extract the public key from the Stellar wallet
 * 3. Generate an external party topology in Canton
 * 4. Sign the topology hash with the Privy wallet
 * 5. Allocate the external party in Canton
 *
 * Important Notes:
 *
 * - This requires Canton Network SDK (@canton-network/wallet-sdk)
 * - The wallet signing must be done with appropriate permissions
 * - The generated party ID can be used for Canton Network transactions
 *
 * Setup:
 *
 * 1. Copy example.env to .env
 * 2. Set PRIVY_APP_ID and PRIVY_APP_SECRET
 * 3. Set CANTON_SCAN_PROXY_URL (e.g., https://wallet.validator.devnet.transfer-agent.xyz/api/validator/v0/scan-proxy)
 * 4. Install dependencies: npm install
 *
 * Run: npx tsx test/canton-party-from-privy-wallet.example.ts [wallet-id] [party-hint]
 *
 * Examples:
 *
 * # Create a new wallet and generate party
 *
 * Npx tsx test/canton-party-from-privy-wallet.example.ts
 *
 * # Use existing wallet to generate party
 *
 * Npx tsx test/canton-party-from-privy-wallet.example.ts gqyevh105eme915lbz92ktef alice
 *
 * # Link wallet to user and generate party
 *
 * Npx tsx test/canton-party-from-privy-wallet.example.ts did:privy:cm94jlli5020iky0lbo19pwf3 bob
 */

import {
  ClientCredentialOAuthController,
  LedgerController,
  TokenStandardController,
  TopologyController,
  UnsafeAuthController,
  WalletSDKImpl,
  localNetAuthDefault,
  localNetLedgerDefault,
  localNetStaticConfig,
  localNetTokenStandardDefault,
  localNetTopologyDefault,
} from '@canton-network/wallet-sdk';
import dotenv from 'dotenv';
import { pino } from 'pino';
import { createPrivyClientFromEnv, createStellarWallet, getStellarWallet } from '../src/utils/privy';

// Load environment variables
dotenv.config();

const logger = pino({ name: 'canton-party-privy', level: 'info' });

// Import SDK package.json to log version
import { readFileSync } from 'fs';
import { join } from 'path';
const sdkPackageJson = JSON.parse(
  readFileSync(join(__dirname, '../node_modules/@canton-network/wallet-sdk/package.json'), 'utf-8')
);
const CANTON_SDK_VERSION = sdkPackageJson.version;

interface GeneratePartyOptions {
  walletId?: string;
  userId?: string;
  partyHint?: string;
  scanProxyUrl?: string;
}

/** Generate a Canton party ID from a Privy Stellar wallet */
async function generateCantonPartyFromPrivyWallet(options: GeneratePartyOptions) {
  const { walletId, userId, partyHint = 'privy-user', scanProxyUrl } = options;

  console.log('='.repeat(70));
  console.log('Canton Party Generation from Privy Stellar Wallet');
  console.log('='.repeat(70));
  console.log();
  console.log(`Canton SDK Version: ${CANTON_SDK_VERSION}`);
  console.log();

  try {
    // Step 1: Initialize Privy client
    console.log('Step 1: Initializing Privy client...');
    const privy = createPrivyClientFromEnv();
    console.log('✓ Privy client initialized');
    console.log();

    // Step 2: Get or create Stellar wallet
    console.log('Step 2: Getting/Creating Stellar wallet...');
    let wallet;

    if (walletId) {
      // Check if walletId is actually a userId (starts with did:privy:)
      if (walletId.startsWith('did:privy:')) {
        console.log(`  Creating new wallet for user: ${walletId}`);
        wallet = await createStellarWallet(privy, { userId: walletId });
        console.log('  ✓ New wallet created and linked to user');
      } else {
        console.log(`  Retrieving existing wallet: ${walletId}`);
        wallet = await getStellarWallet(privy, walletId);
        console.log('  ✓ Wallet retrieved');
      }
    } else if (userId) {
      console.log(`  Creating new wallet for user: ${userId}`);
      wallet = await createStellarWallet(privy, { userId });
      console.log('  ✓ New wallet created and linked to user');
    } else {
      console.log('  Creating new standalone wallet...');
      wallet = await createStellarWallet(privy);
      console.log('  ✓ New standalone wallet created');
    }

    console.log('  Wallet ID:', wallet.id);
    console.log('  Stellar Address:', wallet.address);
    console.log('  Public Key (base64):', wallet.publicKeyBase64);
    console.log();

    // Step 3: Initialize Canton SDK
    console.log('Step 3: Initializing Canton Network SDK...');

    // Use provided scan proxy URL or default from env
    const finalScanProxyUrl =
      scanProxyUrl ?? process.env['CANTON_SCAN_PROXY_URL'] ?? localNetStaticConfig.LOCALNET_SCAN_PROXY_API_URL;

    console.log('  Connecting to scan proxy:', finalScanProxyUrl);

    // Determine network configuration based on scan proxy URL
    // Create custom factory functions for different networks
    let authFactory, ledgerFactory, topologyFactory, tokenStandardFactory;

    if (finalScanProxyUrl.includes('devnet')) {
      // DevNet configuration
      // Check if OAuth credentials are available
      const oauthClientId = process.env['CANTON_OAUTH_CLIENT_ID'];
      const oauthClientSecret = process.env['CANTON_OAUTH_CLIENT_SECRET'];
      const oauthAuthority =
        process.env['CANTON_OAUTH_AUTHORITY'] ?? 'https://auth.transfer-agent.xyz/application/o/validator-devnet/';
      const oauthAudience = process.env['CANTON_OAUTH_AUDIENCE'] ?? 'validator-devnet-m2m';
      const oauthScope = process.env['CANTON_OAUTH_SCOPE'] ?? 'openid';
      const hasOAuthCredentials = Boolean(oauthClientId && oauthClientSecret);

      // Use custom base URL if provided, otherwise default (note: no /v0/ for devnet with OAuth)
      const baseUrl =
        process.env['CANTON_BASE_URL'] ??
        (hasOAuthCredentials
          ? 'https://wallet.validator.devnet.transfer-agent.xyz/api/validator'
          : 'https://wallet.validator.devnet.transfer-agent.xyz/api/validator/v0');

      console.log('  Network: DevNet');
      console.log('  Base URL:', baseUrl);
      console.log('  OAuth Credentials:', hasOAuthCredentials ? '✓ Available' : '✗ Not available (using unsafe auth)');

      if (hasOAuthCredentials) {
        console.log('  OAuth Authority:', oauthAuthority);
        console.log('  OAuth Client ID:', oauthClientId);
        console.log('  OAuth Audience:', oauthAudience);
      }

      console.log('  Auth endpoint:', `${baseUrl}/auth`);
      console.log('  Ledger endpoint:', `${baseUrl}/ledger`);
      console.log('  Topology endpoint:', `${baseUrl}/topology`);
      console.log('  Admin endpoint:', `${baseUrl}/admin`);

      // Use OAuth if credentials are available, otherwise unsafe auth
      authFactory = () => {
        if (hasOAuthCredentials) {
          const auth = new ClientCredentialOAuthController(oauthAuthority, logger);
          auth.userId = oauthClientId;
          auth.userSecret = oauthClientSecret;
          auth.adminId = oauthClientId;
          auth.adminSecret = oauthClientSecret;
          auth.audience = oauthAudience;
          auth.scope = oauthScope;
          console.log('  Auth factory: ClientCredentialOAuthController configured');
          return auth;
        }
        const auth = new UnsafeAuthController(logger);
        auth.userId = 'ledger-api-user';
        auth.adminId = 'ledger-api-admin';
        auth.audience = 'https://canton.network.global';
        auth.unsafeSecret = 'test';
        console.log('  Auth factory: UnsafeAuthController configured (fallback)');
        return auth;
      };

      ledgerFactory = (uid: string, authTokenProvider: any, isAdmin: boolean) => {
        console.log(`  Creating LedgerController: userId=${uid}, isAdmin=${isAdmin}`);
        return new LedgerController(uid, new URL(`${baseUrl}/ledger`), undefined, isAdmin, authTokenProvider);
      };

      topologyFactory = (uid: string, authTokenProvider: any, synchronizerId: any) => {
        console.log(`  Creating TopologyController: userId=${uid}, synchronizerId=${synchronizerId}`);
        return new TopologyController(
          `${baseUrl}/admin`,
          new URL(`${baseUrl}/topology`),
          uid,
          synchronizerId,
          undefined,
          authTokenProvider
        );
      };

      tokenStandardFactory = (uid: string, authTokenProvider: any, isAdmin: boolean) => {
        console.log(`  Creating TokenStandardController: userId=${uid}, isAdmin=${isAdmin}`);
        return new TokenStandardController(
          uid,
          new URL(`${baseUrl}/token-standard`),
          new URL(`${baseUrl}/validator`),
          undefined,
          authTokenProvider,
          isAdmin
        );
      };
    } else if (finalScanProxyUrl.includes('testnet')) {
      // TestNet configuration
      // Check if OAuth credentials are available
      const oauthClientId = process.env['CANTON_OAUTH_CLIENT_ID'];
      const oauthClientSecret = process.env['CANTON_OAUTH_CLIENT_SECRET'];
      const oauthAuthority =
        process.env['CANTON_OAUTH_AUTHORITY'] ?? 'https://auth.transfer-agent.xyz/application/o/validator-testnet/';
      const oauthAudience = process.env['CANTON_OAUTH_AUDIENCE'] ?? 'validator-testnet-m2m';
      const oauthScope = process.env['CANTON_OAUTH_SCOPE'] ?? 'openid';
      const hasOAuthCredentials = Boolean(oauthClientId && oauthClientSecret);

      // Use custom base URL if provided, otherwise default (note: no /v0/ for testnet with OAuth)
      const baseUrl =
        process.env['CANTON_BASE_URL'] ??
        (hasOAuthCredentials
          ? 'https://wallet.validator.testnet.transfer-agent.xyz/api/validator'
          : 'https://wallet.validator.testnet.transfer-agent.xyz/api/validator/v0');

      console.log('  Network: TestNet');
      console.log('  Base URL:', baseUrl);
      console.log('  OAuth Credentials:', hasOAuthCredentials ? '✓ Available' : '✗ Not available (using unsafe auth)');

      // Use OAuth if credentials are available, otherwise unsafe auth
      authFactory = () => {
        if (hasOAuthCredentials) {
          const auth = new ClientCredentialOAuthController(oauthAuthority, logger);
          auth.userId = oauthClientId;
          auth.userSecret = oauthClientSecret;
          auth.adminId = oauthClientId;
          auth.adminSecret = oauthClientSecret;
          auth.audience = oauthAudience;
          auth.scope = oauthScope;
          console.log('  Auth factory: ClientCredentialOAuthController configured');
          return auth;
        }
        const auth = new UnsafeAuthController(logger);
        auth.userId = 'ledger-api-user';
        auth.adminId = 'ledger-api-admin';
        auth.audience = 'https://canton.network.global';
        auth.unsafeSecret = 'test';
        console.log('  Auth factory: UnsafeAuthController configured (fallback)');
        return auth;
      };

      ledgerFactory = (uid: string, authTokenProvider: any, isAdmin: boolean) =>
        new LedgerController(uid, new URL(`${baseUrl}/ledger`), undefined, isAdmin, authTokenProvider);

      topologyFactory = (uid: string, authTokenProvider: any, synchronizerId: any) =>
        new TopologyController(
          `${baseUrl}/admin`,
          new URL(`${baseUrl}/topology`),
          uid,
          synchronizerId,
          undefined,
          authTokenProvider
        );

      tokenStandardFactory = (uid: string, authTokenProvider: any, isAdmin: boolean) =>
        new TokenStandardController(
          uid,
          new URL(`${baseUrl}/token-standard`),
          new URL(`${baseUrl}/validator`),
          undefined,
          authTokenProvider,
          isAdmin
        );
    } else {
      // LocalNet (default)
      console.log('  Network: LocalNet');
      authFactory = localNetAuthDefault;
      ledgerFactory = localNetLedgerDefault;
      topologyFactory = localNetTopologyDefault;
      tokenStandardFactory = localNetTokenStandardDefault;
    }

    const sdk = new WalletSDKImpl().configure({
      logger,
      authFactory,
      ledgerFactory,
      topologyFactory,
      tokenStandardFactory,
    });

    await sdk.connect();
    await sdk.connectAdmin();

    // Connect to topology - handle synchronizer ID
    // For localnet, the SDK handles this automatically
    // For devnet/testnet, we need the synchronizer ID from env or use scan proxy URL as fallback
    const synchronizerId = process.env['CANTON_SYNCHRONIZER_ID'] ?? finalScanProxyUrl;

    try {
      console.log(`  Connecting to topology (synchronizer: ${synchronizerId})...`);
      await sdk.connectTopology(synchronizerId);
      console.log('  ✓ Topology connected');
    } catch (error) {
      console.error('  ⚠ Failed to connect topology:', error instanceof Error ? error.message : String(error));

      if (finalScanProxyUrl.includes('devnet') || finalScanProxyUrl.includes('testnet')) {
        console.error();
        console.error('  For DevNet/TestNet, you need to set CANTON_SYNCHRONIZER_ID in your .env file');
        console.error('  The synchronizer ID should be in the format: global::{hash}');
        console.error('  Contact the Canton Network team to get the correct synchronizer ID');
        console.error();
        throw new Error('Canton topology connection failed - synchronizer ID required for devnet/testnet');
      }
      throw error;
    }

    console.log('✓ Canton SDK initialized');
    console.log();

    // Step 4: Generate external party topology
    console.log('Step 4: Generating external party topology in Canton...');
    console.log(`  Party hint: ${partyHint}`);
    console.log('  Public key (base64):', wallet.publicKeyBase64);

    const generatedParty = await sdk.userLedger?.generateExternalParty(wallet.publicKeyBase64, partyHint);

    if (!generatedParty) {
      throw new Error('Failed to generate external party topology');
    }

    const { multiHash, partyId } = generatedParty;

    console.log('✓ External party topology generated');
    console.log('  Party ID (preliminary):', partyId);
    console.log('  Multi-hash to sign:', multiHash);
    console.log();

    // Step 5: Sign the topology hash with Privy wallet
    console.log('Step 5: Signing topology hash with Privy wallet...');

    // Convert base64 hash to hex for Privy signing
    const multiBuf = Buffer.from(multiHash, 'base64');
    const hexEncoded = multiBuf.toString('hex');

    console.log('  Hash (hex):', hexEncoded);

    // Note: This may fail if the wallet requires user authentication
    // For embedded wallets, this typically requires client-side signing
    let signature: string;
    let encoding: string;

    try {
      const signResult = await privy.wallets().rawSign(wallet.id, {
        params: { hash: `0x${hexEncoded}` },
      });

      ({ signature, encoding } = signResult);

      console.log('✓ Hash signed successfully');
      console.log('  Signature:', signature);
      console.log('  Encoding:', encoding);
      console.log();
    } catch (error) {
      console.error('❌ Failed to sign hash with Privy wallet');
      console.error('  This is expected for embedded wallets (they require user authentication)');
      console.error();
      console.error('  For embedded wallets, you need to:');
      console.error("  1. Use Privy's client SDK in your frontend");
      console.error('  2. Have the user authenticate');
      console.error('  3. Sign the hash client-side');
      console.error('  4. Send the signature to your backend');
      console.error('  5. Complete party allocation server-side with the signature');
      console.error();
      console.error("  For now, we'll show you what the flow would look like...");
      console.error();

      throw error;
    }

    // Step 6: Allocate the external party with the signature
    console.log('Step 6: Allocating external party in Canton...');

    // Convert hex signature to base64 for Canton
    const signatureHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    const signatureBase64 = Buffer.from(signatureHex, 'hex').toString('base64');

    console.log('  Signature (base64):', signatureBase64);

    const allocatedParty = await sdk.userLedger?.allocateExternalParty(signatureBase64, generatedParty);

    if (!allocatedParty) {
      throw new Error('Failed to allocate external party');
    }

    console.log('✓ External party allocated successfully!');
    console.log();

    // Summary
    console.log('='.repeat(70));
    console.log('✅ Canton Party Successfully Generated!');
    console.log('='.repeat(70));
    console.log();
    console.log('Summary:');
    console.log('  Privy Wallet ID:', wallet.id);
    console.log('  Stellar Address:', wallet.address);
    console.log('  Canton Party ID:', allocatedParty.partyId);
    console.log();
    console.log('Database Storage:');
    console.log('  You should store these values together in your database:');
    console.log('  {');
    console.log(`    privy_wallet_id: '${wallet.id}',`);
    console.log(`    stellar_address: '${wallet.address}',`);
    console.log(`    canton_party_id: '${allocatedParty.partyId}'`);
    console.log('  }');
    console.log();
    console.log('Next Steps:');
    console.log('  1. Save the Canton party ID to your database');
    console.log('  2. Use this party ID for Canton Network transactions');
    console.log('  3. The Privy wallet controls this Canton party');
    console.log('  4. Transactions require signing with the Privy wallet');
    console.log();
  } catch (error) {
    console.error('❌ Error occurred:');

    if (error instanceof Error) {
      console.error('  Message:', error.message);

      // Provide helpful guidance for common errors
      if (error.message.includes('No valid user session keys')) {
        console.error();
        console.error('  This error occurs because embedded wallets require user authentication.');
        console.error();
        console.error('  Solution:');
        console.error('  - For production: Implement client-side signing in your frontend');
        console.error('  - For testing: Use a wallet that supports server-side signing');
        console.error('  - For development: You may need to mock the signing step');
      } else if (error.message.includes('CANTON_SCAN_PROXY_URL')) {
        console.error();
        console.error('  Make sure CANTON_SCAN_PROXY_URL is set in your .env file');
        console.error(
          '  Example: CANTON_SCAN_PROXY_URL=https://wallet.validator.devnet.transfer-agent.xyz/api/validator/v0/scan-proxy'
        );
      }

      if (error.stack) {
        console.error();
        console.error('  Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('  Error:', error);
    }

    process.exit(1);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);

  const firstArg = args[0];
  const secondArg = args[1];

  let walletId: string | undefined;
  let userId: string | undefined;
  let partyHint: string | undefined;

  // Parse arguments
  if (firstArg) {
    if (firstArg.startsWith('did:privy:')) {
      // First argument is a user ID
      userId = firstArg;
      partyHint = secondArg ?? 'privy-user';
    } else {
      // First argument is a wallet ID
      walletId = firstArg;
      partyHint = secondArg ?? 'privy-user';
    }
  }

  const scanProxyUrl = process.env['CANTON_SCAN_PROXY_URL'];

  if (!scanProxyUrl) {
    console.warn('⚠️  Warning: CANTON_SCAN_PROXY_URL not set in .env');
    console.warn('   Using default localnet URL. Set it for devnet/testnet usage.');
    console.warn(
      '   Example: CANTON_SCAN_PROXY_URL=https://wallet.validator.devnet.transfer-agent.xyz/api/validator/v0/scan-proxy'
    );
    console.warn();
  }

  await generateCantonPartyFromPrivyWallet({
    walletId,
    userId,
    partyHint,
    scanProxyUrl,
  });
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
