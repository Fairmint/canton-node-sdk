import type { Keypair } from '@stellar/stellar-base';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { stellarPublicKeyToBase64, signWithStellarKeypair } from './stellar-utils';

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
  const { ledgerClient, keypair, partyName, synchronizerId } = params;

  // Step 1: Convert Stellar public key to base64 for Canton
  const publicKeyBase64 = stellarPublicKeyToBase64(keypair);

  // Step 2: Generate external party topology
  const topology = await ledgerClient.generateExternalPartyTopology({
    synchronizer: synchronizerId,
    partyHint: partyName,
    publicKey: {
      format: 'CRYPTO_KEY_FORMAT_RAW',
      keyData: publicKeyBase64,
      keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
    },
    localParticipantObservationOnly: params.localParticipantObservationOnly,
    otherConfirmingParticipantUids: params.otherConfirmingParticipantUids,
    confirmationThreshold: params.confirmationThreshold,
    observingParticipantUids: params.observingParticipantUids,
  });

  const { multiHash, publicKeyFingerprint, topologyTransactions } = topology;

  if (!publicKeyFingerprint) {
    throw new Error('No public key fingerprint returned from topology generation');
  }

  if (!multiHash) {
    throw new Error('No multi-hash returned from topology generation');
  }

  // Step 3: Sign the multi-hash using the Stellar keypair
  const signature = signWithStellarKeypair(keypair, multiHash);

  // Step 4: Wrap topology transactions as SignedTransactions
  const onboardingTransactions =
    topologyTransactions?.map((transaction: string) => ({
      transaction,
    })) ?? [];

  // Step 5: Allocate external party with topology transactions and multi-hash signature
  const allocatedParty = await ledgerClient.allocateExternalParty({
    synchronizer: synchronizerId,
    identityProviderId: 'default',
    onboardingTransactions,
    multiHashSignatures: [
      {
        format: 'SIGNATURE_FORMAT_RAW',
        signature,
        signedBy: publicKeyFingerprint,
        signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
      },
    ],
  });

  if (!allocatedParty.partyId) {
    throw new Error('Failed to allocate external party - no party ID returned');
  }

  // Note: For external parties, we don't need to create a separate user or grant rights.
  // When preparing transactions, we'll use the validator operator's user ID (fetched automatically
  // by prepareExternalTransaction from the validator API). The external signature itself provides
  // the authorization for the transaction.

  return {
    partyId: allocatedParty.partyId,
    userId: '', // Will be resolved automatically when preparing transactions
    publicKey: publicKeyBase64,
    publicKeyFingerprint,
    stellarAddress: keypair.publicKey(),
    stellarSecret: keypair.secret(),
  };
}
