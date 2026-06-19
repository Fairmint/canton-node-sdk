import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ApiError, OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import { allocateExternalParty } from './allocate-external-party';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  assertCantonSha256MultihashHex,
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
  normalizeCantonHashToHex,
  normalizeEd25519PublicKeyForCanton,
} from './canton-protocol';
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
      error
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
      exists: Boolean(readMatchingPartyDetails(raw, partyId)),
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
  error: unknown
): Promise<Record<string, unknown> | null> {
  if (!isConflict(error)) return null;
  try {
    const partyDetailsResponse = await ledgerClient.getPartyDetails({
      party: partyId,
      identityProviderId,
    });
    const partyDetails = readMatchingPartyDetails(partyDetailsResponse, partyId);
    if (!partyDetails) return null;
    return {
      alreadyExisted: true,
      partyDetails,
      allocationError: readErrorDetails(error),
    };
  } catch {
    return null;
  }
}

function readAllocatedExternalPartyId(source: unknown): string {
  const directPartyId = isRecord(source) ? source['partyId'] : undefined;
  if (typeof directPartyId === 'string' && directPartyId.trim()) {
    return directPartyId;
  }
  const partyDetails = readMatchingPartyDetails(source);
  const party = partyDetails?.['party'];
  if (typeof party === 'string' && party.trim()) {
    return party;
  }
  throw new OperationError(
    'Canton external-party allocation response did not include partyId',
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function readMatchingPartyDetails(source: unknown, partyId?: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null;
  const { partyDetails } = source;
  const details = Array.isArray(partyDetails) ? partyDetails : [partyDetails];
  for (const detail of details) {
    if (!isRecord(detail)) continue;
    if (partyId && detail['party'] !== partyId) continue;
    const { party } = detail;
    if (typeof party === 'string' && party.trim()) return detail;
  }
  return null;
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
