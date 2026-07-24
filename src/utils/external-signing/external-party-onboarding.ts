import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ApiError, OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { runWithAbortSignal } from '../../core/utils/abort';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import { allocateExternalParty } from './allocate-external-party';
import { type CantonEd25519Signature, normalizeCantonEd25519Signature } from './canton-ed25519-signer';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  assertCantonSha256MultihashHex,
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
  hashHexToBase64,
  normalizeCantonHashToHex,
  normalizeEd25519PublicKeyForCanton,
} from './canton-protocol';
import { readMatchingExternalPartyDetails } from './external-party-details';
import { generateExternalPartyTopology } from './generate-external-party';

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
  /** Other participant UIDs that should confirm for this party. */
  readonly otherConfirmingParticipantUids?: readonly string[];
  /** Confirmation threshold for multi-hosted party (default: all confirmers). */
  readonly confirmationThreshold?: number;
  /** Other participant UIDs that should only observe. */
  readonly observingParticipantUids?: readonly string[];
}

export interface PreparedExternalPartyOnboarding {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
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
 * The caller should ask the end-user wallet to sign `multiHashHex` before calling {@link submitExternalPartyOnboarding}.
 */
export async function prepareExternalPartyOnboarding(
  options: PrepareExternalPartyOnboardingOptions
): Promise<PreparedExternalPartyOnboarding> {
  validateRequiredString('synchronizerId', options.synchronizerId);
  validateRequiredString('partyHint', options.partyHint);

  const topology = await generateExternalPartyTopology({
    ledgerClient: options.ledgerClient,
    synchronizerId: options.synchronizerId,
    partyHint: options.partyHint,
    publicKey: {
      format: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
      keyData: normalizeEd25519PublicKeyForCanton(options.publicKeyBase64),
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

  return {
    partyId,
    publicKeyFingerprint,
    multiHashHex: normalizeCantonHashToHex(
      readRequiredString(topology, 'multiHash', 'topology generation'),
      'topology generation'
    ),
    synchronizerId: options.synchronizerId,
    topologyTransactions: readRequiredStringArray(topology, 'topologyTransactions', 'topology generation'),
    publicKeyFormat: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
    signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
    raw: topology,
  };
}

/**
 * Creates an external party using an external Ed25519 signer.
 *
 * Use this when the private key is held by a wallet service or browser wallet. The SDK prepares Canton topology, passes
 * the multihash to `signMultiHash`, validates the returned signature against the submitted public key, and submits the
 * allocation.
 */
export async function createExternalPartyWithSigner(
  options: CreateExternalPartyWithSignerOptions
): Promise<CreatedExternalPartyWithSigner> {
  const publicKeyBase64 = normalizeEd25519PublicKeyForCanton(options.publicKeyBase64);
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

/** Verifies the end-user Ed25519 signature and submits prepared external-party topology to Canton. */
export async function submitExternalPartyOnboarding(
  options: SubmitExternalPartyOnboardingOptions
): Promise<SubmittedExternalPartyOnboarding> {
  validateRequiredString('synchronizerId', options.synchronizerId);
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: options.partyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
  });
  const multiHashHex = assertCantonSha256MultihashHex(options.multiHashHex);
  assertCantonHashSignature({
    publicKeyBase64: options.publicKeyBase64,
    hashHex: multiHashHex,
    signatureBase64: options.multiHashSignatureBase64,
  });

  try {
    const raw = await allocateExternalParty({
      ledgerClient: options.ledgerClient,
      synchronizerId: options.synchronizerId,
      identityProviderId: options.identityProviderId ?? DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
      onboardingTransactions: options.topologyTransactions.map((transaction) => ({ transaction })),
      multiHashSignatures: [
        {
          format: CANTON_RAW_SIGNATURE_FORMAT,
          signature: options.multiHashSignatureBase64,
          signedBy: publicKeyFingerprint,
          signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
        },
      ],
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
  publicKeyBase64: string
): Promise<{
  readonly publicKeyFingerprint: string;
  readonly parties: readonly string[];
  readonly raw: unknown;
}> {
  const publicKeyFingerprint = deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64);
  const raw = await ledgerClient.listParties({});
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
  identityProviderId = DEFAULT_CANTON_IDENTITY_PROVIDER_ID
): Promise<{
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly exists: boolean;
  readonly raw: unknown;
}> {
  const publicKeyFingerprint = deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64);
  const partyId = buildExternalPartyId(partyHint, publicKeyFingerprint);
  try {
    const raw = await ledgerClient.getPartyDetails({ party: partyId, identityProviderId });
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
    return assertCantonPartyMatchesPublicKey(input);
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
