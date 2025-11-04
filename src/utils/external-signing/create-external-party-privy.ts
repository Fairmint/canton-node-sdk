import type { PrivyClient } from '@privy-io/node';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import type { StellarWallet } from '../privy/types';

/** Parameters for creating an external party with Privy */
export interface CreateExternalPartyPrivyParams {
  /** Privy client instance */
  privyClient: PrivyClient;
  /** Ledger JSON API client instance */
  ledgerClient: LedgerJsonApiClient;
  /** Party name hint (will be used as prefix in party ID) */
  partyName: string;
  /** Synchronizer ID to onboard the party on */
  synchronizerId: string;
  /** Identity provider ID (default: 'default') */
  identityProviderId?: string;
  /** Optional: existing Privy wallet to use. If not provided, creates a new one */
  wallet?: StellarWallet;
  /** Optional: user ID to link the wallet to (format: did:privy:...) */
  userId?: string;
  /** If true, the local participant will only observe, not confirm (default: false) */
  localParticipantObservationOnly?: boolean;
  /** Other participant UIDs that should confirm for this party */
  otherConfirmingParticipantUids?: string[];
  /** Confirmation threshold for multi-hosted party (default: all confirmers) */
  confirmationThreshold?: number;
  /** Other participant UIDs that should only observe */
  observingParticipantUids?: string[];
}

/** Result of creating an external party with Privy */
export interface CreateExternalPartyPrivyResult {
  /** Generated party ID (e.g., "alice::12abc...") */
  partyId: string;
  /** User ID for preparing transactions */
  userId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** Fingerprint of the public key */
  publicKeyFingerprint: string;
  /** Privy wallet information */
  wallet: StellarWallet;
}

/**
 * Creates an external party in Canton using Privy for key management
 *
 * This function combines wallet creation (if needed) and party onboarding:
 *
 * 1. Creates a new Privy Stellar wallet (or uses provided wallet)
 * 2. Generates topology transactions with the wallet's public key
 * 3. Signs the topology transactions via Privy
 * 4. Submits the signed transactions to allocate the party
 *
 * @example
 *   ```typescript
 *   import { createPrivyClient, createExternalPartyPrivy } from '@fairmint/canton-node-sdk';
 *
 *   const privy = createPrivyClient({
 *     appId: process.env.PRIVY_APP_ID!,
 *     appSecret: process.env.PRIVY_APP_SECRET!
 *   });
 *
 *   const party = await createExternalPartyPrivy({
 *     privyClient: privy,
 *     ledgerClient,
 *     partyName: 'alice',
 *     synchronizerId: 'global-synchronizer',
 *   });
 *
 *   console.log('Party ID:', party.partyId);
 *   console.log('Wallet ID:', party.wallet.id);
 *   ```;
 *
 * @param params - Configuration for external party creation
 * @returns Party details including party ID, wallet info, and key fingerprint
 */
export async function createExternalPartyPrivy(
  params: CreateExternalPartyPrivyParams
): Promise<CreateExternalPartyPrivyResult> {
  const {
    privyClient,
    ledgerClient,
    partyName,
    synchronizerId,
    identityProviderId = '',
    wallet: existingWallet,
    userId,
    localParticipantObservationOnly,
    otherConfirmingParticipantUids,
    confirmationThreshold,
    observingParticipantUids,
  } = params;

  // Step 1: Get or create Privy wallet
  let wallet: StellarWallet;
  if (existingWallet) {
    wallet = existingWallet;
  } else {
    // Import createStellarWallet dynamically to avoid circular dependencies
    const { createStellarWallet } = await import('../privy/createWallet');
    wallet = await createStellarWallet(privyClient, userId ? { userId } : undefined);
  }

  // Step 2: Wrap the raw public key in DER X.509 SubjectPublicKeyInfo format
  // wallet.publicKeyBase64 is the raw 32-byte Ed25519 public key
  // Canton's Ledger API requires it to be wrapped in DER format
  const { wrapEd25519PublicKeyInDER } = await import('./stellar-utils');
  const rawPublicKey = Buffer.from(wallet.publicKeyBase64, 'base64');
  const derWrappedPublicKey = wrapEd25519PublicKeyInDER(rawPublicKey);
  const derPublicKeyBase64 = derWrappedPublicKey.toString('base64');

  // Also keep hex version for return value (from raw key, not DER-wrapped)
  const publicKeyHex = rawPublicKey.toString('hex');

  // Step 3: Generate external party topology using Ledger JSON API
  const topology = await ledgerClient.generateExternalPartyTopology({
    synchronizer: synchronizerId,
    partyHint: partyName,
    publicKey: {
      format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
      keyData: derPublicKeyBase64,
      keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
    },
    localParticipantObservationOnly,
    otherConfirmingParticipantUids,
    confirmationThreshold,
    observingParticipantUids,
  });

  const { partyId, multiHash, topologyTransactions } = topology;

  if (!partyId) {
    throw new Error('No party ID returned from topology generation');
  }

  if (!multiHash) {
    throw new Error('No multi-hash returned from topology generation');
  }

  if (!topologyTransactions || topologyTransactions.length === 0) {
    throw new Error('No topology transactions returned from topology generation');
  }

  // Step 4: Sign the multi-hash using Privy
  // The multiHash from Canton is in base64 format, but signWithWallet expects hex
  const multiHashBuffer = Buffer.from(multiHash, 'base64');
  const multiHashHex = multiHashBuffer.toString('hex');

  const { signWithWallet } = await import('../privy/signData');

  const signResult = await signWithWallet(privyClient, {
    walletId: wallet.id,
    data: multiHashHex,
  });

  // Convert signature from hex (with 0x prefix) to base64 for Canton
  const signatureHex = signResult.signature.startsWith('0x') ? signResult.signature.slice(2) : signResult.signature;
  const signatureBase64 = Buffer.from(signatureHex, 'hex').toString('base64');

  // Step 5: Allocate the party using Ledger JSON API
  // We need to pass both the topology transactions and the multi-hash signature
  // Transform the topology transactions (array of strings) into the expected format
  const onboardingTransactions = topologyTransactions.map((transaction) => ({ transaction }));

  const allocateResult = await ledgerClient.allocateExternalParty({
    synchronizer: synchronizerId,
    identityProviderId,
    onboardingTransactions,
    multiHashSignatures: [
      {
        format: 'SIGNATURE_FORMAT_RAW',
        signature: signatureBase64,
        signedBy: partyId.split('::')[1] ?? '', // fingerprint
        signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
      },
    ],
  });

  if (!allocateResult.partyId) {
    throw new Error('Failed to allocate external party - no party ID returned');
  }

  // Note: For external parties, we don't need to create a separate user or grant rights.
  // When preparing transactions, we'll use the validator operator's user ID (fetched automatically
  // by prepareExternalTransaction). The external signature itself provides the authorization.

  return {
    partyId: allocateResult.partyId,
    userId: '', // Will be resolved automatically when preparing transactions
    publicKey: publicKeyHex,
    publicKeyFingerprint: partyId.split('::')[1] ?? '', // Extract fingerprint from party ID
    wallet,
  };
}
