import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ApiError, OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { runWithAbortSignal } from '../../core/utils/abort';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import { allocateExternalParty } from './allocate-external-party';
import { normalizeAllocationUserId } from './allocation-user-id';
import { type CantonEd25519Signature, normalizeCantonEd25519Signature } from './canton-ed25519-signer';
import { computeTopologyMultiHash } from '@fairmint/canton-protocol/topology';
import { hashHexToBase64 } from './canton-protocol';
import { assertCantonHashSigned } from './hash-signature';
import {
  assertPartyKey,
  cantonHashHexOf,
  cantonPublicKeyBase64,
  externalPartyIdOf,
  onCallerInput,
  publicKeyFingerprintOf,
} from './party-identity';
import { readMatchingExternalPartyDetails } from './external-party-details';
import { generateExternalPartyTopology } from './generate-external-party';
import {
  checkOnboardingHosting,
  onboardingHostingExpectation,
  readLocalParticipantUid,
  verifyGeneratedOnboardingTopology,
} from './onboarding-topology';

export const CANTON_DER_X509_PUBLIC_KEY_FORMAT = 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO';
export const CANTON_EC_CURVE25519_PUBLIC_KEY_SPEC = 'SIGNING_KEY_SPEC_EC_CURVE25519';
export const CANTON_RAW_SIGNATURE_FORMAT = 'SIGNATURE_FORMAT_RAW';
export const CANTON_ED25519_SIGNATURE_ALGORITHM = 'SIGNING_ALGORITHM_SPEC_ED25519';
export const DEFAULT_CANTON_IDENTITY_PROVIDER_ID = '';

export interface PrepareExternalPartyOnboardingOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly synchronizerId: string;
  readonly partyHint: string;
  readonly publicKeyBase64: string;
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

export interface PreparedExternalPartyOnboarding {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  /**
   * The multi-hash the party signs, canonical hex (`1220…`): recomputed from `topologyTransactions` after they were
   * checked against the requested onboarding, never the participant's own value.
   */
  readonly multiHashHex: string;
  readonly synchronizerId: string;
  readonly topologyTransactions: readonly string[];
  readonly publicKeyFormat: typeof CANTON_DER_X509_PUBLIC_KEY_FORMAT;
  readonly signingAlgorithmSpec: typeof CANTON_ED25519_SIGNATURE_ALGORITHM;
  readonly raw: unknown;
}

export interface SubmitExternalPartyOnboardingOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly synchronizerId: string;
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly multiHashHex: string;
  readonly topologyTransactions: readonly string[];
  readonly multiHashSignatureBase64: string;
  readonly publicKeyFingerprint?: string | null;
  /**
   * Participant user that gets `CanActAs` on the new party, so that user can submit commands for it (for example the
   * server's own ledger user). Trimmed, then checked with Canton's user id rule (non-empty, at most 128 characters,
   * ASCII letters, digits and "@^$.!`-#+'~_|:()") before anything is prepared, signed or sent. The ledger grants the
   * right only when the allocation itself succeeds, so when `allowAlreadyExists`confirms an existing party the SDK
   * reads the user's rights and, only when`CanActAs`on the party is missing, grants it (granting needs participant
   * admin or identity-provider admin rights; an ordinary user allocating for itself already holds the right after its
   * first allocation, so its replay grants nothing). A successful return means the user can act as the party; when the
   * right is missing and the caller may not grant it, an`OperationError` says so. Omit it to grant no user rights (the
   * ledger's default).
   */
  readonly userId?: string;
  readonly identityProviderId?: string;
  /**
   * Cancels the allocation request. Cancellation after dispatch has an ambiguous outcome; reconcile `partyId` before
   * deciding whether to submit another allocation.
   */
  readonly signal?: AbortSignal;
  /**
   * Treat a 409 allocation conflict as success when the party already exists and the party details endpoint confirms
   * it.
   */
  readonly allowAlreadyExists?: boolean;
}

export interface SubmittedExternalPartyOnboarding {
  readonly partyId: string;
  readonly raw: Record<string, unknown>;
  readonly alreadyExisted: boolean;
}

/** Preserves an allocation conflict when its bounded existence confirmation is canceled. */
export class ExternalPartyConflictReconciliationError extends Error {
  readonly partyId: string;
  readonly allocationError: unknown;
  declare readonly cause: unknown;

  constructor(options: { readonly partyId: string; readonly allocationError: unknown; readonly cause: unknown }) {
    super('Canton external-party conflict reconciliation was aborted');
    this.name = 'ExternalPartyConflictReconciliationError';
    this.partyId = options.partyId;
    this.allocationError = options.allocationError;
    this.cause = options.cause;
  }
}

export interface ExternalPartyHashSigningRequest {
  readonly partyHint: string;
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly synchronizerId: string;
  readonly multiHashHex: string;
  readonly multiHashBase64: string;
  readonly topologyTransactions: readonly string[];
  readonly signingAlgorithmSpec: typeof CANTON_ED25519_SIGNATURE_ALGORITHM;
}

/** @deprecated Use {@link CantonEd25519Signature}. */
export type ExternalPartyHashSignature = CantonEd25519Signature;

export type ExternalPartyHashSigner = (
  request: ExternalPartyHashSigningRequest
) => ExternalPartyHashSignature | Promise<ExternalPartyHashSignature>;

export interface CreateExternalPartyWithSignerOptions extends PrepareExternalPartyOnboardingOptions {
  readonly signMultiHash: ExternalPartyHashSigner;
  readonly identityProviderId?: string;
  /**
   * Participant user that gets `CanActAs` on the new party, so that user can submit commands for it (for example the
   * server's own ledger user). Trimmed, then checked with Canton's user id rule (non-empty, at most 128 characters,
   * ASCII letters, digits and "@^$.!`-#+'~_|:()") before anything is prepared, signed or sent. The ledger grants the
   * right only when the allocation itself succeeds, so when `allowAlreadyExists`confirms an existing party the SDK
   * reads the user's rights and, only when`CanActAs`on the party is missing, grants it (granting needs participant
   * admin or identity-provider admin rights; an ordinary user allocating for itself already holds the right after its
   * first allocation, so its replay grants nothing). A successful return means the user can act as the party; when the
   * right is missing and the caller may not grant it, an`OperationError` says so. Omit it to grant no user rights (the
   * ledger's default).
   */
  readonly userId?: string;
  /**
   * Cancels allocation transport. It does not cancel topology preparation or the caller-provided signer callback, and
   * it cannot undo an allocation already accepted by Canton.
   */
  readonly signal?: AbortSignal;
  /**
   * Treat a 409 allocation conflict as success when the party already exists and the party details endpoint confirms
   * it.
   */
  readonly allowAlreadyExists?: boolean;
}

export interface CreatedExternalPartyWithSigner {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  readonly publicKeyBase64: string;
  readonly synchronizerId: string;
  readonly prepared: PreparedExternalPartyOnboarding;
  readonly submitted: SubmittedExternalPartyOnboarding;
  readonly alreadyExisted: boolean;
}

/**
 * Prepares external-party topology for a raw or DER-wrapped Ed25519 public key.
 *
 * The participant's answer is not trusted: the SDK reads the local participant's unique identifier (`GET
 * /v2/parties/participant-id`), checks the generated topology states exactly the requested onboarding (the party, its
 * one key with the usages `NAMESPACE`, `PROTOCOL` and `PROOF_OF_OWNERSHIP`, the hosting participants with their
 * permissions, and the confirmation threshold) and recomputes the multi-hash from it. A topology that differs, or a
 * participant multi-hash that is not the recomputed one, is an `OperationError` (`TRANSACTION_FAILED`) whose `cause` is
 * `@fairmint/canton-protocol`'s `CantonProtocolError`. Canton 3.4 or later is required (one generated transaction).
 *
 * The caller should ask the end-user wallet to sign `multiHashHex` (the recomputed multi-hash) before calling
 * {@link submitExternalPartyOnboarding}.
 */
export async function prepareExternalPartyOnboarding(
  options: PrepareExternalPartyOnboardingOptions
): Promise<PreparedExternalPartyOnboarding> {
  validateRequiredString('synchronizerId', options.synchronizerId);
  validateRequiredString('partyHint', options.partyHint);
  const publicKeyBase64 = cantonPublicKeyBase64(options.publicKeyBase64);
  const hosting = onboardingHostingExpectation(
    checkOnboardingHosting(options),
    await readLocalParticipantUid(options.ledgerClient)
  );

  const topology = await generateExternalPartyTopology({
    ledgerClient: options.ledgerClient,
    synchronizerId: options.synchronizerId,
    partyHint: options.partyHint,
    publicKey: {
      format: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
      keyData: publicKeyBase64,
      keySpec: CANTON_EC_CURVE25519_PUBLIC_KEY_SPEC,
    },
    ...(options.localParticipantObservationOnly !== undefined
      ? { localParticipantObservationOnly: options.localParticipantObservationOnly }
      : {}),
    ...(options.otherConfirmingParticipantUids !== undefined
      ? { otherConfirmingParticipantUids: options.otherConfirmingParticipantUids }
      : {}),
    ...(options.confirmationThreshold !== undefined ? { confirmationThreshold: options.confirmationThreshold } : {}),
    ...(options.observingParticipantUids !== undefined
      ? { observingParticipantUids: options.observingParticipantUids }
      : {}),
  });

  const partyId = readRequiredString(topology, 'partyId', 'topology generation');
  const publicKeyFingerprint = assertGeneratedPartyMatchesPublicKey({
    partyId,
    publicKeyBase64: options.publicKeyBase64,
  });

  const topologyTransactions = readRequiredStringArray(topology, 'topologyTransactions', 'topology generation');
  const multiHashHex = verifyGeneratedOnboardingTopology({
    transactions: topologyTransactions,
    multiHash: readRequiredString(topology, 'multiHash', 'topology generation'),
    partyId,
    publicKeyBase64,
    hosting,
  });

  return {
    partyId,
    publicKeyFingerprint,
    multiHashHex,
    synchronizerId: options.synchronizerId,
    topologyTransactions,
    publicKeyFormat: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
    signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
    raw: topology,
  };
}

/**
 * Creates an external party using an external Ed25519 signer.
 *
 * Use this when the private key is held by a wallet service or browser wallet. The SDK prepares Canton topology and
 * checks it (see {@link prepareExternalPartyOnboarding}), passes the multi-hash it recomputed to `signMultiHash`,
 * validates the returned signature against the submitted public key, and submits the allocation. `signMultiHash` is
 * never called for a topology that does not match the request.
 */
export async function createExternalPartyWithSigner(
  options: CreateExternalPartyWithSignerOptions
): Promise<CreatedExternalPartyWithSigner> {
  const userId = options.userId === undefined ? undefined : normalizeAllocationUserId(options.userId);
  const publicKeyBase64 = cantonPublicKeyBase64(options.publicKeyBase64);
  const prepared = await prepareExternalPartyOnboarding({
    ledgerClient: options.ledgerClient,
    synchronizerId: options.synchronizerId,
    partyHint: options.partyHint,
    publicKeyBase64,
    ...(options.localParticipantObservationOnly !== undefined
      ? { localParticipantObservationOnly: options.localParticipantObservationOnly }
      : {}),
    ...(options.otherConfirmingParticipantUids !== undefined
      ? { otherConfirmingParticipantUids: options.otherConfirmingParticipantUids }
      : {}),
    ...(options.confirmationThreshold !== undefined ? { confirmationThreshold: options.confirmationThreshold } : {}),
    ...(options.observingParticipantUids !== undefined
      ? { observingParticipantUids: options.observingParticipantUids }
      : {}),
  });
  const signature = await options.signMultiHash({
    partyHint: options.partyHint,
    partyId: prepared.partyId,
    publicKeyBase64,
    publicKeyFingerprint: prepared.publicKeyFingerprint,
    synchronizerId: prepared.synchronizerId,
    multiHashHex: prepared.multiHashHex,
    multiHashBase64: hashHexToBase64(prepared.multiHashHex),
    topologyTransactions: prepared.topologyTransactions,
    signingAlgorithmSpec: prepared.signingAlgorithmSpec,
  });
  const submitted = await submitExternalPartyOnboarding({
    ledgerClient: options.ledgerClient,
    synchronizerId: prepared.synchronizerId,
    partyId: prepared.partyId,
    publicKeyBase64,
    publicKeyFingerprint: prepared.publicKeyFingerprint,
    multiHashHex: prepared.multiHashHex,
    topologyTransactions: prepared.topologyTransactions,
    multiHashSignatureBase64: normalizeExternalPartyHashSignature(signature),
    ...(options.identityProviderId !== undefined ? { identityProviderId: options.identityProviderId } : {}),
    ...(userId !== undefined ? { userId } : {}),
    ...(options.allowAlreadyExists !== undefined ? { allowAlreadyExists: options.allowAlreadyExists } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  return {
    partyId: submitted.partyId,
    publicKeyFingerprint: prepared.publicKeyFingerprint,
    publicKeyBase64,
    synchronizerId: prepared.synchronizerId,
    prepared,
    submitted,
    alreadyExisted: submitted.alreadyExisted,
  };
}

/**
 * Verifies the submitted topology and the end-user Ed25519 signature, then submits the prepared external-party topology
 * to Canton. `multiHashHex` must be the multi-hash recomputed from `topologyTransactions`, and the signature must
 * verify over it with `publicKeyBase64`; otherwise a `ValidationError` is thrown and nothing is allocated.
 */
export async function submitExternalPartyOnboarding(
  options: SubmitExternalPartyOnboardingOptions
): Promise<SubmittedExternalPartyOnboarding> {
  validateRequiredString('synchronizerId', options.synchronizerId);
  const userId = options.userId === undefined ? undefined : normalizeAllocationUserId(options.userId);
  const publicKeyFingerprint = assertPartyKey({
    partyId: options.partyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
  });
  const multiHashHex = cantonHashHexOf(options.multiHashHex);
  const recomputedMultiHashHex = onCallerInput(() => computeTopologyMultiHash(options.topologyTransactions));
  if (recomputedMultiHashHex !== multiHashHex) {
    throw new ValidationError('multiHashHex is not the multi-hash of topologyTransactions', {
      multiHashHex,
      recomputedMultiHashHex,
    });
  }
  await assertCantonHashSigned({
    publicKeyBase64: options.publicKeyBase64,
    hashHex: multiHashHex,
    signatureBase64: options.multiHashSignatureBase64,
  });
  const multiHashSignature = normalizeExternalPartyHashSignature({ signatureBase64: options.multiHashSignatureBase64 });

  try {
    const raw = await allocateExternalParty({
      ledgerClient: options.ledgerClient,
      synchronizerId: options.synchronizerId,
      identityProviderId: options.identityProviderId ?? DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
      onboardingTransactions: options.topologyTransactions.map((transaction) => ({ transaction })),
      multiHashSignatures: [
        {
          format: CANTON_RAW_SIGNATURE_FORMAT,
          signature: multiHashSignature,
          signedBy: publicKeyFingerprint,
          signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
        },
      ],
      ...(userId !== undefined ? { userId } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });
    const partyId = readAllocatedExternalPartyId(raw);
    if (partyId !== options.partyId) {
      throw new OperationError(
        'Canton external-party allocation response did not match the prepared party ID',
        OperationErrorCode.TRANSACTION_FAILED,
        { expectedPartyId: options.partyId, partyId }
      );
    }
    return {
      partyId,
      raw: objectOrEmpty(raw),
      alreadyExisted: false,
    };
  } catch (error) {
    if (!options.allowAlreadyExists) {
      throw error;
    }
    const existing = await readExistingExternalPartyAfterAllocationConflict(
      options.ledgerClient,
      options.partyId,
      options.identityProviderId ?? DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
      error,
      options.signal
    );
    if (!existing) {
      throw error;
    }
    if (userId !== undefined) {
      await ensureActAsOnExistingParty(
        options.ledgerClient,
        userId,
        options.partyId,
        options.identityProviderId ?? DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
        options.signal
      );
    }
    return {
      partyId: options.partyId,
      raw: existing,
      alreadyExisted: true,
    };
  }
}

function normalizeExternalPartyHashSignature(signature: ExternalPartyHashSignature): string {
  try {
    return normalizeCantonEd25519Signature(signature);
  } catch (error) {
    if (error instanceof ValidationError && error.context?.['expectedLength'] === 64) {
      throw new ValidationError('External-party signer must return a 64-byte Ed25519 signature', error.context);
    }
    throw error;
  }
}

/** Lists party ids whose suffix matches the supplied Ed25519 public key fingerprint. */
export async function listExternalPartyIdsForPublicKey(
  ledgerClient: LedgerJsonApiClient,
  publicKeyBase64: string,
  signal?: AbortSignal
): Promise<{
  readonly publicKeyFingerprint: string;
  readonly parties: readonly string[];
  readonly raw: unknown;
}> {
  const publicKeyFingerprint = publicKeyFingerprintOf(publicKeyBase64);
  const raw =
    signal === undefined ? await ledgerClient.listParties({}) : await ledgerClient.listParties({}, { signal });
  return {
    publicKeyFingerprint,
    parties: readPartyIdsByFingerprint(raw, publicKeyFingerprint),
    raw,
  };
}

/** Checks one exact external-party id built from party hint and public key. */
export async function getExternalPartyIdForHintAndPublicKey(
  ledgerClient: LedgerJsonApiClient,
  partyHint: string,
  publicKeyBase64: string,
  identityProviderId = DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
  signal?: AbortSignal
): Promise<{
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly exists: boolean;
  readonly raw: unknown;
}> {
  const publicKeyFingerprint = publicKeyFingerprintOf(publicKeyBase64);
  const partyId = externalPartyIdOf(partyHint, publicKeyFingerprint);
  try {
    const params = { party: partyId, identityProviderId };
    const raw =
      signal === undefined
        ? await ledgerClient.getPartyDetails(params)
        : await ledgerClient.getPartyDetails(params, { signal });
    return {
      publicKeyFingerprint,
      partyId,
      exists: Boolean(readMatchingExternalPartyDetails(raw, partyId)),
      raw,
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        publicKeyFingerprint,
        partyId,
        exists: false,
        raw: null,
      };
    }
    throw error;
  }
}

/**
 * Makes sure `userId` holds `CanActAs` on an external party that already existed. The ledger grants the allocation's
 * `userId` only when the allocation itself succeeds, so an idempotent replay (a retry after an ambiguous first
 * allocation, or a party first allocated for another user) may need the right granted here. The user's rights are read
 * first (any user may read its own, an admin any user's) and the grant, which needs participant admin or
 * identity-provider admin rights, is sent only when the right is missing. Returns only once the user is known to hold
 * the right; throws an `OperationError` when the caller may not read the rights, or the right is missing and the caller
 * may not grant it.
 */
async function ensureActAsOnExistingParty(
  ledgerClient: LedgerJsonApiClient,
  userId: string,
  partyId: string,
  identityProviderId: string,
  signal: AbortSignal | undefined
): Promise<void> {
  let listed: unknown;
  try {
    const listParams = { userId, identityProviderId };
    listed =
      signal === undefined
        ? await ledgerClient.listUserRights(listParams)
        : await ledgerClient.listUserRights(listParams, { signal });
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    throw new OperationError(
      `Party ${partyId} already exists, but the caller may not read user ${userId}'s rights, so it cannot confirm that user can act as the party`,
      OperationErrorCode.TRANSACTION_FAILED,
      { partyId, userId, identityProviderId, cause: errorMessage(error) }
    );
  }
  if (hasCanActAs(listed, partyId)) return;
  try {
    const grantParams = {
      userId,
      identityProviderId,
      rights: [{ kind: { CanActAs: { value: { party: partyId } } } }],
    };
    if (signal === undefined) {
      await ledgerClient.grantUserRights(grantParams);
    } else {
      await ledgerClient.grantUserRights(grantParams, { signal });
    }
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    throw new OperationError(
      `Party ${partyId} already exists and user ${userId} does not hold CanActAs on it; granting it needs participant admin or identity-provider admin rights, which the caller lacks`,
      OperationErrorCode.TRANSACTION_FAILED,
      { partyId, userId, identityProviderId, cause: errorMessage(error) }
    );
  }
}

/** Whether a `ListUserRights` answer holds `CanActAs` on `partyId`. */
function hasCanActAs(listed: unknown, partyId: string): boolean {
  const rights = isRecord(listed) ? listed['rights'] : undefined;
  if (!Array.isArray(rights)) return false;
  return rights.some((right: unknown) => {
    const kind = isRecord(right) ? right['kind'] : undefined;
    const canActAs = isRecord(kind) ? kind['CanActAs'] : undefined;
    const value = isRecord(canActAs) ? canActAs['value'] : undefined;
    return isRecord(value) && value['party'] === partyId;
  });
}

function isPermissionDenied(error: unknown): boolean {
  const status = readErrorStatus(error);
  return status === 401 || status === 403;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateRequiredString(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
}

function assertGeneratedPartyMatchesPublicKey(input: {
  readonly partyId: string;
  readonly publicKeyBase64: string;
}): string {
  try {
    return assertPartyKey(input);
  } catch (error) {
    throw new OperationError(
      'Canton topology generation response did not include a party ID matching the submitted public key',
      OperationErrorCode.TRANSACTION_FAILED,
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

async function readExistingExternalPartyAfterAllocationConflict(
  ledgerClient: LedgerJsonApiClient,
  partyId: string,
  identityProviderId: string,
  error: unknown,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  if (!isConflict(error)) return null;
  const abortError = new ValidationError('Canton external-party conflict reconciliation was aborted', { partyId });
  const createAbortError = (): ValidationError => abortError;
  try {
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- non-async arrow preserves rejection timing expected by race tests
    const partyDetailsResponse = await runWithAbortSignal(signal, createAbortError, () =>
      signal === undefined
        ? ledgerClient.getPartyDetails({
            party: partyId,
            identityProviderId,
          })
        : ledgerClient.getPartyDetails(
            {
              party: partyId,
              identityProviderId,
            },
            { signal }
          )
    );
    const partyDetails = readMatchingExternalPartyDetails(partyDetailsResponse, partyId);
    if (!partyDetails) return null;
    return {
      alreadyExisted: true,
      partyDetails,
      allocationError: readErrorDetails(error),
    };
  } catch (cause) {
    if (cause === abortError) {
      throw new ExternalPartyConflictReconciliationError({
        partyId,
        allocationError: error,
        cause,
      });
    }
    return null;
  }
}

function readAllocatedExternalPartyId(source: unknown): string {
  const directPartyId = isRecord(source) ? source['partyId'] : undefined;
  if (typeof directPartyId === 'string' && directPartyId.trim()) {
    return directPartyId;
  }
  const partyDetails = readMatchingExternalPartyDetails(source);
  const party = partyDetails?.['party'];
  if (typeof party === 'string' && party.trim()) {
    return party;
  }
  throw new OperationError(
    'Canton external-party allocation response did not include partyId',
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function readPartyIdsByFingerprint(source: unknown, publicKeyFingerprint: string): string[] {
  const partyDetails = isRecord(source) ? source['partyDetails'] : undefined;
  if (!Array.isArray(partyDetails)) return [];
  const seen = new Set<string>();
  for (const detail of partyDetails) {
    const party = isRecord(detail) ? detail['party'] : undefined;
    if (typeof party !== 'string') continue;
    const partyId = party.trim();
    if (!partyId.endsWith(`::${publicKeyFingerprint}`)) continue;
    seen.add(partyId);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

function readRequiredStringArray(source: unknown, key: string, operation: string): string[] {
  if (isRecord(source) && key in source) {
    const value = source[key];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())) {
      return [...value];
    }
  }
  throw new OperationError(
    `Canton ${operation} response did not include ${key}`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function isConflict(error: unknown): boolean {
  return readErrorStatus(error) === 409;
}

function isNotFound(error: unknown): boolean {
  return readErrorStatus(error) === 404;
}

function readErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (!isRecord(error)) return undefined;
  const { status } = error;
  return typeof status === 'number' ? status : undefined;
}

function readErrorDetails(error: unknown): Record<string, unknown> {
  if (!isRecord(error)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  return objectOrEmpty(error);
}
