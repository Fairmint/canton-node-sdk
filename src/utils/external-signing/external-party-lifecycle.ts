import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  isDefiniteCantonMutationRejection,
  normalizeCantonError,
  readCantonDefiniteAnswer,
  ValidationError,
  type NormalizedCantonErrorDetails,
} from '../../core/errors';
import { isRecord } from '../../core/utils';
import { checkPartySynchronizerReadiness, type PartySynchronizerReadiness } from '../party-readiness';
import { assertCantonPartyMatchesPublicKey } from './canton-protocol';
import { DEFAULT_CANTON_IDENTITY_PROVIDER_ID } from './external-party-onboarding';

export type ExternalPartyOnboardingState = 'not-found' | 'allocated' | 'in-flight' | 'ready' | 'unknown';

interface ExternalPartyOnboardingStatusBase {
  readonly state: ExternalPartyOnboardingState;
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  readonly synchronizerId: string;
  readonly exists: boolean | null;
  readonly ready: boolean;
}

export interface ExternalPartyNotFoundStatus extends ExternalPartyOnboardingStatusBase {
  readonly state: 'not-found';
  readonly exists: false;
  readonly ready: false;
  readonly partyDetails: null;
}

export interface ExternalPartyInFlightStatus extends ExternalPartyOnboardingStatusBase {
  readonly state: 'in-flight';
  readonly exists: true;
  readonly ready: false;
  readonly partyDetails: Record<string, unknown>;
  readonly readiness: PartySynchronizerReadiness;
}

export interface ExternalPartyAllocatedStatus extends ExternalPartyOnboardingStatusBase {
  readonly state: 'allocated';
  readonly exists: true;
  readonly ready: false;
  readonly partyDetails: Record<string, unknown>;
  readonly readiness: PartySynchronizerReadiness;
}

export interface ExternalPartyReadyStatus extends ExternalPartyOnboardingStatusBase {
  readonly state: 'ready';
  readonly exists: true;
  readonly ready: true;
  readonly partyDetails: Record<string, unknown>;
  readonly readiness: PartySynchronizerReadiness;
}

export interface ExternalPartyUnknownStatus extends ExternalPartyOnboardingStatusBase {
  readonly state: 'unknown';
  readonly exists: boolean | null;
  readonly ready: false;
  readonly failedAt: 'party-details' | 'readiness';
  readonly failure: ExternalPartyStatusFailure;
  readonly partyDetails?: Record<string, unknown>;
}

export type ExternalPartyOnboardingStatus =
  | ExternalPartyNotFoundStatus
  | ExternalPartyAllocatedStatus
  | ExternalPartyInFlightStatus
  | ExternalPartyReadyStatus
  | ExternalPartyUnknownStatus;

export interface ExternalPartyStatusFailure {
  readonly name: string;
  readonly message: string;
  readonly status?: number;
  readonly code?: string;
  readonly context?: unknown;
}

export interface ReconcileExternalPartyOnboardingOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly synchronizerId: string;
  readonly identityProviderId?: string;
  readonly participantId?: string;
  /** Set false when local observation, rather than local submit permission, is the intended terminal state. */
  readonly expectSubmitReady?: boolean;
}

/**
 * Reconciles external-party visibility and submit readiness without relying on allocation error text.
 *
 * `in-flight` means the party is allocated locally but has not yet become submission-capable on the requested
 * synchronizer. `unknown` preserves transport/API uncertainty instead of incorrectly treating it as absence.
 */
export async function reconcileExternalPartyOnboarding(
  options: ReconcileExternalPartyOnboardingOptions
): Promise<ExternalPartyOnboardingStatus> {
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: options.partyId,
    publicKeyBase64: options.publicKeyBase64,
  });
  const base = {
    partyId: options.partyId,
    publicKeyFingerprint,
    synchronizerId: options.synchronizerId,
  };

  let partyDetails: Record<string, unknown>;
  try {
    const raw = await options.ledgerClient.getPartyDetails({
      party: options.partyId,
      identityProviderId: options.identityProviderId ?? DEFAULT_CANTON_IDENTITY_PROVIDER_ID,
    });
    const matched = readMatchingPartyDetails(raw, options.partyId);
    if (!matched) {
      return {
        ...base,
        state: 'unknown',
        exists: null,
        ready: false,
        failedAt: 'party-details',
        failure: {
          name: 'UnexpectedCantonResponse',
          message: 'Canton party details response did not contain the requested party',
        },
      };
    }
    partyDetails = matched;
  } catch (error) {
    if (readErrorStatus(error) === 404) {
      return {
        ...base,
        state: 'not-found',
        exists: false,
        ready: false,
        partyDetails: null,
      };
    }
    return {
      ...base,
      state: 'unknown',
      exists: null,
      ready: false,
      failedAt: 'party-details',
      failure: normalizeStatusFailure(error),
    };
  }

  try {
    const readiness = await checkPartySynchronizerReadiness({
      ledgerClient: options.ledgerClient,
      party: options.partyId,
      synchronizerId: options.synchronizerId,
      ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
    });
    if (readiness.ready) {
      return {
        ...base,
        state: 'ready',
        exists: true,
        ready: true,
        partyDetails,
        readiness,
      };
    }
    if (options.expectSubmitReady === false) {
      return {
        ...base,
        state: 'allocated',
        exists: true,
        ready: false,
        partyDetails,
        readiness,
      };
    }
    return {
      ...base,
      state: 'in-flight',
      exists: true,
      ready: false,
      partyDetails,
      readiness,
    };
  } catch (error) {
    return {
      ...base,
      state: 'unknown',
      exists: true,
      ready: false,
      failedAt: 'readiness',
      failure: normalizeStatusFailure(error),
      partyDetails,
    };
  }
}

export type ExternalPartyAllocationFailureKind = 'already-exists' | 'definite-rejection' | 'ambiguous';

export interface ExternalPartyAllocationFailure {
  readonly kind: ExternalPartyAllocationFailureKind;
  readonly definite: boolean;
  readonly shouldReconcile: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly details: ExternalPartyStatusFailure;
}

/** Classifies allocation failures from structured SDK/Canton fields, never from localized error messages. */
export function classifyExternalPartyAllocationFailure(error: unknown): ExternalPartyAllocationFailure {
  const details = normalizeStatusFailure(error);
  const alreadyExists = details.status === 409 && details.code === 'ALREADY_EXISTS';
  if (alreadyExists) {
    return {
      kind: 'already-exists',
      definite: true,
      shouldReconcile: true,
      status: 409,
      code: 'ALREADY_EXISTS',
      details,
    };
  }

  const definiteAnswer = readCantonDefiniteAnswer(error);
  const definite = definiteAnswer ?? (error instanceof ValidationError || isDefiniteCantonMutationRejection(error));
  return {
    kind: definite ? 'definite-rejection' : 'ambiguous',
    definite,
    shouldReconcile: !definite,
    ...(details.status !== undefined ? { status: details.status } : {}),
    ...(details.code !== undefined ? { code: details.code } : {}),
    details,
  };
}

export interface ReconcileExternalPartyAllocationFailureOptions extends ReconcileExternalPartyOnboardingOptions {
  readonly error: unknown;
}

export interface ExternalPartyAllocationReconciliation {
  readonly failure: ExternalPartyAllocationFailure;
  readonly status: ExternalPartyOnboardingStatus;
}

/** Returns one structured allocation failure plus the currently observable party lifecycle state. */
export async function reconcileExternalPartyAllocationFailure(
  options: ReconcileExternalPartyAllocationFailureOptions
): Promise<ExternalPartyAllocationReconciliation> {
  const failure = classifyExternalPartyAllocationFailure(options.error);
  const status = await reconcileExternalPartyOnboarding(options);
  return { failure, status };
}

function readMatchingPartyDetails(source: unknown, partyId: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null;
  const { partyDetails } = source;
  const details = Array.isArray(partyDetails) ? partyDetails : [partyDetails];
  for (const detail of details) {
    if (!isRecord(detail) || detail['party'] !== partyId) continue;
    return detail;
  }
  return null;
}

function normalizeStatusFailure(error: unknown): ExternalPartyStatusFailure {
  const normalized = normalizeCantonError(error);
  if (normalized) return toStatusFailure(normalized);
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: String(error) };
}

function toStatusFailure(details: NormalizedCantonErrorDetails): ExternalPartyStatusFailure {
  return {
    name: details.name,
    message: details.message,
    ...(details.status !== undefined ? { status: details.status } : {}),
    ...(details.code !== undefined ? { code: details.code } : {}),
    ...(details.context !== undefined ? { context: details.context } : {}),
  };
}

function readErrorStatus(error: unknown): number | undefined {
  return normalizeCantonError(error)?.status;
}
