/**
 * Node-sdk's check of the onboarding topology a participant generates for an external party. Internal: not exported
 * from the package.
 *
 * A participant answers `/v2/parties/external/generate-topology` with topology transactions and their multi-hash, which
 * the party's key signs. Node-sdk signs neither on the participant's word: `@fairmint/canton-protocol/topology` decodes
 * the transaction, checks it states exactly the onboarding node-sdk asked for (the party, its one key with the usages
 * Canton gives an external party's key, the hosting participants with their permissions, and the confirmation
 * threshold), recomputes the multi-hash and compares it with the participant's. Only the recomputed multi-hash is
 * handed to a signer.
 *
 * The expectation is derived from the request: the local participant (its unique identifier read from `GET
 * /v2/parties/participant-id`) hosts the party with `CONFIRMATION`, or `OBSERVATION` when
 * `localParticipantObservationOnly`; each of `otherConfirmingParticipantUids` with `CONFIRMATION`; each of
 * `observingParticipantUids` with `OBSERVATION`; the threshold is `confirmationThreshold`, or every confirming
 * participant when it is omitted or 0 (Canton's default).
 */
import { isCantonProtocolError } from '@fairmint/canton-protocol/party';
import {
  type HostingParticipantExpectation,
  isParticipantUid,
  type SigningKeyUsage,
  verifyPartyOnboardingTopology,
} from '@fairmint/canton-protocol/topology';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { callerInputError } from './party-identity';

/** The usages Canton (3.4 and later) gives an external party's signing key in its generated onboarding topology. */
export const EXTERNAL_PARTY_KEY_USAGES: readonly SigningKeyUsage[] = Object.freeze([
  'NAMESPACE',
  'PROTOCOL',
  'PROOF_OF_OWNERSHIP',
]);

/** The hosting a caller asks generate-topology for. */
export interface OnboardingHostingRequest {
  readonly localParticipantObservationOnly?: boolean | undefined;
  readonly otherConfirmingParticipantUids?: readonly string[] | undefined;
  readonly confirmationThreshold?: number | undefined;
  readonly observingParticipantUids?: readonly string[] | undefined;
}

/** A hosting request whose own values are valid; the local participant is not known yet. */
export interface CheckedOnboardingHosting {
  readonly localPermission: 'CONFIRMATION' | 'OBSERVATION';
  readonly otherConfirming: readonly string[];
  readonly observing: readonly string[];
  readonly threshold: number;
}

/** The hosting the generated topology must state, exactly. */
export interface OnboardingHostingExpectation {
  readonly participants: readonly HostingParticipantExpectation[];
  readonly threshold: number;
}

/**
 * Checks the caller's hosting options before anything is sent: every participant UID is a participant's unique
 * identifier (`name::1220…`, no `PAR::` prefix), none is listed twice, `confirmationThreshold` is a non-negative
 * integer, and at least one participant confirms, at least as many as the threshold. Throws a {@link ValidationError}.
 */
export function checkOnboardingHosting(request: OnboardingHostingRequest): CheckedOnboardingHosting {
  const otherConfirming = readParticipantUids('otherConfirmingParticipantUids', request.otherConfirmingParticipantUids);
  const observing = readParticipantUids('observingParticipantUids', request.observingParticipantUids);
  const seen = new Set<string>();
  for (const uid of [...otherConfirming, ...observing]) {
    if (seen.has(uid)) {
      throw new ValidationError('A hosting participant UID is listed more than once', { participantUid: uid });
    }
    seen.add(uid);
  }
  const localPermission = request.localParticipantObservationOnly === true ? 'OBSERVATION' : 'CONFIRMATION';
  const confirmers = otherConfirming.length + (localPermission === 'CONFIRMATION' ? 1 : 0);
  if (confirmers === 0) {
    throw new ValidationError(
      'An external party needs at least one confirming participant: the local participant observes only and no other confirming participant is given'
    );
  }
  const requested = request.confirmationThreshold;
  if (requested !== undefined && (!Number.isSafeInteger(requested) || requested < 0)) {
    throw new ValidationError('confirmationThreshold must be a non-negative integer', {
      confirmationThreshold: requested,
    });
  }
  const threshold = requested === undefined || requested === 0 ? confirmers : requested;
  if (threshold > confirmers) {
    throw new ValidationError('confirmationThreshold exceeds the number of confirming participants', {
      confirmationThreshold: threshold,
      confirmingParticipants: confirmers,
    });
  }
  return { localPermission, otherConfirming, observing, threshold };
}

/**
 * The exact hosting the topology must state, with the local participant's UID added. Throws a {@link ValidationError}
 * when the caller listed the local participant among the other participants.
 */
export function onboardingHostingExpectation(
  hosting: CheckedOnboardingHosting,
  localParticipantUid: string
): OnboardingHostingExpectation {
  if (hosting.otherConfirming.includes(localParticipantUid) || hosting.observing.includes(localParticipantUid)) {
    throw new ValidationError('The local participant must not be listed among the other hosting participants', {
      participantUid: localParticipantUid,
    });
  }
  return {
    participants: [
      { participantUid: localParticipantUid, permission: hosting.localPermission },
      ...hosting.otherConfirming.map((participantUid) => ({ participantUid, permission: 'CONFIRMATION' as const })),
      ...hosting.observing.map((participantUid) => ({ participantUid, permission: 'OBSERVATION' as const })),
    ],
    threshold: hosting.threshold,
  };
}

/**
 * The local participant's unique identifier (`GET /v2/parties/participant-id`). An answer that is not one
 * (`name::1220…`) fails the operation.
 */
export async function readLocalParticipantUid(ledgerClient: LedgerJsonApiClient): Promise<string> {
  const response: unknown = await ledgerClient.getParticipantId();
  const participantId = isRecord(response) ? response['participantId'] : undefined;
  if (!isParticipantUid(participantId)) {
    throw new OperationError(
      'Canton participant-id response did not include a participant unique identifier (name::1220…)',
      OperationErrorCode.TRANSACTION_FAILED
    );
  }
  return participantId;
}

/** The input of {@link verifyGeneratedOnboardingTopology}. */
export interface GeneratedOnboardingTopology {
  /** The participant's topology transactions, base64. */
  readonly transactions: readonly string[];
  /** The participant's multi-hash of them, hex or base64. */
  readonly multiHash: string;
  /** The party requested: `hint::fingerprint` built from the request, never the participant's own value. */
  readonly partyId: string;
  /** The party's Ed25519 public key, raw or DER, base64. */
  readonly publicKeyBase64: string;
  readonly hosting: OnboardingHostingExpectation;
}

/**
 * Checks the participant's generated topology against the requested onboarding and returns the multi-hash recomputed
 * from it (canonical hex), the only hash to sign. A topology that differs, does not decode, or whose multi-hash is not
 * the participant's fails the operation with an {@link OperationError} (`TRANSACTION_FAILED`) whose `cause` is
 * canton-protocol's refusal and whose context names its `code` and `field`. A refusal of the expectation itself
 * (`INVALID_INPUT` on `expected.*`) is the caller's input: a {@link ValidationError}.
 */
export function verifyGeneratedOnboardingTopology(input: GeneratedOnboardingTopology): string {
  try {
    return verifyPartyOnboardingTopology({
      transactions: input.transactions,
      multiHash: input.multiHash,
      expected: {
        partyId: input.partyId,
        publicKey: input.publicKeyBase64,
        threshold: input.hosting.threshold,
        participants: input.hosting.participants,
        keyUsages: EXTERNAL_PARTY_KEY_USAGES,
      },
    }).multiHash;
  } catch (error) {
    if (!isCantonProtocolError(error)) throw error;
    if (error.code === 'INVALID_INPUT' && error.field?.startsWith('expected.') === true) {
      throw callerInputError(error);
    }
    const operationError = new OperationError(
      generatedTopologyRefusalMessage(error.code, error.field),
      OperationErrorCode.TRANSACTION_FAILED,
      { code: error.code, ...(error.field === undefined ? {} : { field: error.field }) }
    );
    Object.defineProperty(operationError, 'cause', { value: error, enumerable: false, writable: true });
    throw operationError;
  }
}

function generatedTopologyRefusalMessage(code: string, field: string | undefined): string {
  if (field === 'multiHash') {
    return code === 'HASH_MISMATCH'
      ? 'Canton topology generation response multiHash is not the multi-hash of its topology transactions'
      : 'Canton topology generation response did not include a valid SHA-256 multihash';
  }
  return 'Canton topology generation response does not match the requested external-party onboarding';
}

function readParticipantUids(name: string, uids: readonly string[] | undefined): readonly string[] {
  if (uids === undefined) return [];
  return uids.map((uid, index) => {
    if (!isParticipantUid(uid)) {
      throw new ValidationError(
        `${name}[${index}] must be a participant unique identifier (name::1220 and 64 lowercase hex, no PAR:: prefix)`,
        { [name]: uid }
      );
    }
    return uid;
  });
}
