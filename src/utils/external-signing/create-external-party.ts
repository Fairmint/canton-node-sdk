import type { Keypair } from '@stellar/stellar-base';
import type { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { OperationError, OperationErrorCode } from '../../core/errors';
import { normalizeAllocationUserId } from './allocation-user-id';
import {
  checkOnboardingHosting,
  onboardingHostingExpectation,
  readLocalParticipantUid,
  verifyGeneratedOnboardingTopology,
} from './onboarding-topology';
import { assertPartyKey } from './party-identity';
import { stellarPublicKeyToBase64, stellarPublicKeyToHex } from './stellar-utils';

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
  /**
   * Participant user granted `CanActAs` on the new party. Trimmed, then checked with Canton's user id rule (non-empty,
   * at most 128 characters, ASCII letters, digits and "@^$.!`-#+'~_|:()") before topology is generated. Omit to grant
   * no user rights.
   */
  readonly userId?: string;
  /** If true, the local participant will only observe, not confirm (default: false). */
  readonly localParticipantObservationOnly?: boolean;
  /**
   * Other participant UIDs that should confirm for this party: each a participant's unique identifier, `name::1220<64
   * lowercase hex>` without the `PAR::` prefix, listed once, and not the local participant.
   */
  readonly otherConfirmingParticipantUids?: readonly string[];
  /**
   * Confirmation threshold for multi-hosted party: a non-negative integer, at most the number of confirming
   * participants (default, or 0: all confirmers).
   */
  readonly confirmationThreshold?: number;
  /** Other participant UIDs that should only observe (same form and rules as `otherConfirmingParticipantUids`). */
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
 * 2. Check them and sign the multi-hash recomputed from them
 * 3. Allocate the party
 *
 * The keypair's private key is used to sign the onboarding transactions, proving ownership of the public key. The
 * participant's answer is not signed on its word: the SDK reads the local participant's unique identifier (`GET
 * /v2/parties/participant-id`), checks that the generated topology states exactly the requested onboarding (the party
 * of this key, the key with the usages `NAMESPACE`, `PROTOCOL` and `PROOF_OF_OWNERSHIP`, the hosting participants with
 * their permissions, and the confirmation threshold), recomputes the multi-hash and signs only that. A topology that
 * differs is an `OperationError` (`TRANSACTION_FAILED`) and nothing is signed or allocated. Canton 3.4 or later is
 * required.
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
    userId: rawUserId,
    localParticipantObservationOnly,
    otherConfirmingParticipantUids,
    confirmationThreshold,
    observingParticipantUids,
  } = params;
  const userId = rawUserId === undefined ? undefined : normalizeAllocationUserId(rawUserId);
  const hostingRequest = checkOnboardingHosting({
    localParticipantObservationOnly,
    otherConfirmingParticipantUids,
    confirmationThreshold,
    observingParticipantUids,
  });

  // Step 1: Convert Stellar public key to base64 for Ledger API
  const publicKeyBase64 = stellarPublicKeyToBase64(keypair);
  const publicKeyHex = stellarPublicKeyToHex(keypair);

  // Step 2: Generate external party topology using Ledger JSON API
  const hosting = onboardingHostingExpectation(hostingRequest, await readLocalParticipantUid(ledgerClient));
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

  const rawTopologyTransactions: unknown = topologyTransactions;
  if (
    !Array.isArray(rawTopologyTransactions) ||
    rawTopologyTransactions.length === 0 ||
    !rawTopologyTransactions.every((transaction) => typeof transaction === 'string')
  ) {
    throw new OperationError(
      'No topology transactions returned from topology generation',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyName, synchronizerId, partyId }
    );
  }

  // The party must be this key's, and the topology exactly the requested onboarding.
  let publicKeyFingerprint: string;
  try {
    publicKeyFingerprint = assertPartyKey({ partyId, publicKeyBase64 });
  } catch (error) {
    throw new OperationError(
      'Topology generation returned a party ID that does not match the keypair',
      OperationErrorCode.PARTY_CREATION_FAILED,
      { partyId, partyName, cause: error instanceof Error ? error.message : String(error) }
    );
  }
  const multiHashHex = verifyGeneratedOnboardingTopology({
    transactions: rawTopologyTransactions,
    multiHash,
    partyId,
    publicKeyBase64,
    hosting,
  });

  // Step 3: Sign the recomputed multi-hash using the Stellar keypair (raw signature, base64 for Canton)
  const multiHashSignature = keypair.sign(Buffer.from(multiHashHex, 'hex')).toString('base64');

  // Step 4: Allocate the party using Ledger JSON API
  const onboardingTransactions = rawTopologyTransactions.map((transaction) => ({ transaction }));

  const allocateResult = await ledgerClient.allocateExternalParty({
    synchronizer: synchronizerId,
    identityProviderId,
    ...(userId !== undefined ? { userId } : {}),
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
