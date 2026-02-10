import type { Keypair } from '@stellar/stellar-base';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { OperationError, OperationErrorCode } from '../../core/errors';
import { signHexWithStellarKeypair, stellarPublicKeyToBase64, stellarPublicKeyToHex } from './stellar-utils';

/** Parameters for creating an external party. */
export interface CreateExternalPartyParams {
  /** Ledger JSON API client instance. */
  readonly ledgerClient: LedgerJsonApiClient;
  /** Stellar keypair for the party (Ed25519). */
  readonly keypair: Keypair;
  /** Party name hint (will be used as prefix in party ID). */
  readonly partyName: string;
  /** Synchronizer ID to onboard the party on. */
  readonly synchronizerId: string;
  /** Identity provider ID (default: 'default'). */
  readonly identityProviderId?: string;
  /** If true, the local participant will only observe, not confirm (default: false). */
  readonly localParticipantObservationOnly?: boolean;
  /** Other participant UIDs that should confirm for this party. */
  readonly otherConfirmingParticipantUids?: readonly string[];
  /** Confirmation threshold for multi-hosted party (default: all confirmers). */
  readonly confirmationThreshold?: number;
  /** Other participant UIDs that should only observe. */
  readonly observingParticipantUids?: readonly string[];
}

/** Result of creating an external party. */
export interface CreateExternalPartyResult {
  /** Generated party ID (e.g., "alice::12abc..."). */
  readonly partyId: string;
  /** Hex-encoded raw Ed25519 public key. */
  readonly publicKey: string;
  /** Fingerprint of the public key. */
  readonly publicKeyFingerprint: string;
  /** Stellar address (public key in Stellar format). */
  readonly stellarAddress: string;
  /** Stellar secret key (KEEP SECURE!). */
  readonly stellarSecret: string;
}

/**
 * Creates an external party in Canton
 *
 * This is a convenience function that combines the three-step process:
 *
 * 1. Generate topology transactions
 * 2. Sign the multi-hash
 * 3. Allocate the party
 *
 * The keypair's private key is used to sign the onboarding transactions, proving ownership of the public key.
 *
 * @example
 *   ```typescript
 *   import { Keypair } from '@stellar/stellar-base';
 *   import { createExternalParty } from '@fairmint/canton-node-sdk';
 *
 *   const keypair = Keypair.random();
 *   const party = await createExternalParty({
 *     ledgerClient,
 *     keypair,
 *     partyName: 'alice',
 *     synchronizerId: 'global-synchronizer',
 *   });
 *
 *   console.log('Party ID:', party.partyId);
 *   console.log('Public Key Fingerprint:', party.publicKeyFingerprint);
 *   ```;
 *
 * @param params - Configuration for external party creation
 * @returns Party details including party ID and key fingerprint
 */
export async function createExternalParty(params: CreateExternalPartyParams): Promise<CreateExternalPartyResult> {
  const {
    ledgerClient,
    keypair,
    partyName,
    synchronizerId,
    identityProviderId = 'default',
    localParticipantObservationOnly,
    otherConfirmingParticipantUids,
    confirmationThreshold,
    observingParticipantUids,
  } = params;

  // Step 1: Convert Stellar public key to base64 for Ledger API
  const publicKeyBase64 = stellarPublicKeyToBase64(keypair);
  const publicKeyHex = stellarPublicKeyToHex(keypair);

  // Step 2: Generate external party topology using Ledger JSON API
  const topology = await ledgerClient.generateExternalPartyTopology({
    synchronizer: synchronizerId,
    partyHint: partyName,
    publicKey: {
      format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
      keyData: publicKeyBase64,
      keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
    },
    localParticipantObservationOnly,
    otherConfirmingParticipantUids: otherConfirmingParticipantUids ? [...otherConfirmingParticipantUids] : undefined,
    confirmationThreshold,
    observingParticipantUids: observingParticipantUids ? [...observingParticipantUids] : undefined,
  });

  const { partyId, multiHash, topologyTransactions } = topology;

  if (!partyId) {
    throw new OperationError(
      'No party ID returned from topology generation',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyName, synchronizerId }
    );
  }

  if (!multiHash) {
    throw new OperationError(
      'No multi-hash returned from topology generation',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyName, synchronizerId, partyId }
    );
  }

  if (!topologyTransactions || topologyTransactions.length === 0) {
    throw new OperationError(
      'No topology transactions returned from topology generation',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyName, synchronizerId, partyId }
    );
  }

  // Validate fingerprint before using it in the API call
  const publicKeyFingerprint = partyId.split('::')[1];
  if (!publicKeyFingerprint) {
    throw new OperationError(
      'Failed to extract public key fingerprint from party ID',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyId, partyName }
    );
  }

  // Step 3: Sign the multi-hash using the Stellar keypair
  const multiHashSignatureHex = signHexWithStellarKeypair(keypair, multiHash);
  // Convert signature from hex to base64 for Canton
  const multiHashSignature = Buffer.from(multiHashSignatureHex, 'hex').toString('base64');

  // Step 4: Allocate the party using Ledger JSON API
  const onboardingTransactions = topologyTransactions.map((transaction: string) => ({ transaction }));

  const allocateResult = await ledgerClient.allocateExternalParty({
    synchronizer: synchronizerId,
    identityProviderId,
    onboardingTransactions,
    multiHashSignatures: [
      {
        format: 'SIGNATURE_FORMAT_RAW',
        signature: multiHashSignature,
        signedBy: publicKeyFingerprint,
        signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
      },
    ],
  });

  if (!allocateResult.partyId) {
    throw new OperationError(
      'Failed to allocate external party - no party ID returned',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyName, synchronizerId }
    );
  }

  return {
    partyId: allocateResult.partyId,
    publicKey: publicKeyHex,
    publicKeyFingerprint,
    stellarAddress: keypair.publicKey(),
    stellarSecret: keypair.secret(),
  };
}
