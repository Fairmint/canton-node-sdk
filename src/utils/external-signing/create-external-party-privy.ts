import type { PrivyClient } from '@privy-io/node';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
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
  const { privyClient, partyName, wallet: existingWallet, userId } = params;

  // Initialize Validator API client
  const validatorClient = new ValidatorApiClient();

  // Step 1: Get or create Privy wallet
  let wallet: StellarWallet;
  if (existingWallet) {
    wallet = existingWallet;
  } else {
    // Import createStellarWallet dynamically to avoid circular dependencies
    const { createStellarWallet } = await import('../privy/createWallet');
    wallet = await createStellarWallet(privyClient, userId ? { userId } : undefined);
  }

  // Step 2: Convert public key from base64 to hex for Validator API
  const publicKeyHex = Buffer.from(wallet.publicKeyBase64, 'base64').toString('hex');

  // Step 3: Generate external party topology using Validator API
  const topology = await validatorClient.generateExternalPartyTopology({
    party_hint: partyName,
    public_key: publicKeyHex,
  });

  const { party_id, topology_txs } = topology;

  if (!party_id) {
    throw new Error('No party ID returned from topology generation');
  }

  if (topology_txs?.length === 0) {
    throw new Error('No topology transactions returned from topology generation');
  }

  // Step 4: Sign each topology transaction hash using Privy
  const { signWithWallet } = await import('../privy/signData');

  const signedTopologyTxs = await Promise.all(
    topology_txs.map(async (tx) => {
      const signResult = await signWithWallet(privyClient, {
        walletId: wallet.id,
        data: tx.hash,
      });

      // Convert signature from hex (with 0x prefix) to hex without prefix
      const signatureHex = signResult.signature.startsWith('0x') ? signResult.signature.slice(2) : signResult.signature;

      return {
        topology_tx: tx.topology_tx,
        signed_hash: signatureHex,
      };
    })
  );

  // Step 5: Submit the signed topology transactions using Validator API
  const submitResult = await validatorClient.submitExternalPartyTopology({
    public_key: publicKeyHex,
    signed_topology_txs: signedTopologyTxs,
  });

  if (!submitResult.party_id) {
    throw new Error('Failed to submit external party topology - no party ID returned');
  }

  // Note: For external parties, we don't need to create a separate user or grant rights.
  // When preparing transactions, we'll use the validator operator's user ID (fetched automatically
  // by prepareExternalTransaction from the validator API). The external signature itself provides
  // the authorization for the transaction.

  return {
    partyId: submitResult.party_id,
    userId: '', // Will be resolved automatically when preparing transactions
    publicKey: publicKeyHex,
    publicKeyFingerprint: party_id.split('::')[1] ?? '', // Extract fingerprint from party ID
    wallet,
  };
}
