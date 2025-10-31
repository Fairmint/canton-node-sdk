import type { Keypair } from '@stellar/stellar-base';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { stellarPublicKeyToHex, signHexWithStellarKeypair } from './stellar-utils';

/**
 * Parameters for creating an external party
 */
export interface CreateExternalPartyParams {
  /** Ledger JSON API client instance */
  ledgerClient: LedgerJsonApiClient;
  /** Stellar keypair for the party (Ed25519) */
  keypair: Keypair;
  /** Party name hint (will be used as prefix in party ID) */
  partyName: string;
  /** Synchronizer ID to onboard the party on */
  synchronizerId: string;
  /** If true, the local participant will only observe, not confirm (default: false) */
  localParticipantObservationOnly?: boolean;
  /** Other participant UIDs that should confirm for this party */
  otherConfirmingParticipantUids?: string[];
  /** Confirmation threshold for multi-hosted party (default: all confirmers) */
  confirmationThreshold?: number;
  /** Other participant UIDs that should only observe */
  observingParticipantUids?: string[];
}

/**
 * Result of creating an external party
 */
export interface CreateExternalPartyResult {
  /** Generated party ID (e.g., "alice::12abc...") */
  partyId: string;
  /** User ID for preparing transactions */
  userId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** Fingerprint of the public key */
  publicKeyFingerprint: string;
  /** Stellar address (public key in Stellar format) */
  stellarAddress: string;
  /** Stellar secret key (KEEP SECURE!) */
  stellarSecret: string;
}

/**
 * Creates an external party in Canton
 *
 * This is a convenience function that combines the three-step process:
 * 1. Generate topology transactions
 * 2. Sign the multi-hash
 * 3. Allocate the party
 *
 * The keypair's private key is used to sign the onboarding transactions,
 * proving ownership of the public key.
 *
 * @example
 * ```typescript
 * import { Keypair } from '@stellar/stellar-base';
 * import { createExternalParty } from '@fairmint/canton-node-sdk';
 *
 * const keypair = Keypair.random();
 * const party = await createExternalParty({
 *   ledgerClient,
 *   keypair,
 *   partyName: 'alice',
 *   synchronizerId: 'global-synchronizer',
 * });
 *
 * console.log('Party ID:', party.partyId);
 * console.log('Public Key Fingerprint:', party.publicKeyFingerprint);
 * ```
 *
 * @param params - Configuration for external party creation
 * @returns Party details including party ID and key fingerprint
 */
export async function createExternalParty(
  params: CreateExternalPartyParams
): Promise<CreateExternalPartyResult> {
  const { keypair, partyName } = params;

  // Initialize Validator API client
  const validatorClient = new ValidatorApiClient();

  // Step 1: Convert Stellar public key to hex for Validator API
  const publicKeyHex = stellarPublicKeyToHex(keypair);

  // Step 2: Generate external party topology using Validator API
  const topology = await validatorClient.generateExternalPartyTopology({
    party_hint: partyName,
    public_key: publicKeyHex,
  });

  const { party_id, topology_txs } = topology;

  if (!party_id) {
    throw new Error('No party ID returned from topology generation');
  }

  if (!topology_txs || topology_txs.length === 0) {
    throw new Error('No topology transactions returned from topology generation');
  }

  // Step 3: Sign each topology transaction hash using the Stellar keypair
  const signedTopologyTxs = topology_txs.map((tx) => ({
    topology_tx: tx.topology_tx,
    signed_hash: signHexWithStellarKeypair(keypair, tx.hash),
  }));

  // Step 4: Submit the signed topology transactions using Validator API
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
    publicKeyFingerprint: party_id.split('::')[1] || '', // Extract fingerprint from party ID
    stellarAddress: keypair.publicKey(),
    stellarSecret: keypair.secret(),
  };
}
