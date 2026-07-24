import {
  isDefiniteCantonMutationRejection,
  normalizeCantonError,
  OperationError,
  OperationErrorCode,
  readCantonDefiniteAnswer,
  ValidationError,
} from '../../core/errors';
import { isAbortError } from '../../core/http/abort';
import { readRequiredString } from '../canton-response-utils';
import { waitForPartyCanSubmit, type WaitForPartyCanSubmitOptions } from '../party-readiness';
import {
  CantonEd25519SigningPurpose,
  signAndVerifyCantonEd25519Payload,
  type CantonEd25519Signer,
  type CantonEd25519SigningContext,
  type CantonEd25519SigningRequest,
} from './canton-ed25519-signer';
import {
  assertCantonPartyMatchesPublicKey,
  normalizeEd25519PublicKeyForCanton,
  preparedTransactionHashToHex,
} from './canton-protocol';
import {
  createDefaultInteractiveSubmissionDeduplicationPeriod,
  executeExternalTransactionAndWait,
  type ExecuteExternalTransactionAndWaitResult,
  type ExecuteExternalTransactionOptions,
  type InteractiveSubmissionHashingSchemeVersion,
} from './execute-external-transaction';
import {
  classifyExternalPartyAllocationFailure,
  reconcileExternalPartyAllocationFailure,
  reconcileExternalPartyOnboarding,
  type ExternalPartyAllocationReconciliation,
  type ExternalPartyOnboardingStatus,
} from './external-party-lifecycle';
import {
  CANTON_ED25519_SIGNATURE_ALGORITHM,
  CANTON_RAW_SIGNATURE_FORMAT,
  createExternalPartyWithSigner,
  ExternalPartyConflictReconciliationError,
  type CreatedExternalPartyWithSigner,
  type PrepareExternalPartyOnboardingOptions,
} from './external-party-onboarding';
import {
  prepareExternalTransaction,
  type PrepareExternalTransactionOptions,
  type PrepareExternalTransactionResult,
} from './prepare-external-transaction';

export interface CreateExternalPartyWithEd25519SignerOptions extends Omit<
  PrepareExternalPartyOnboardingOptions,
  'publicKeyBase64'
> {
  readonly signer: CantonEd25519Signer;
  readonly identityProviderId?: string;
  /** Treat a confirmed existing party as an idempotent success (default: true). */
  readonly allowAlreadyExists?: boolean;
  /** Poll for submit readiness after allocation (default: true; ignored for observation-only onboarding). */
  readonly waitForReady?: boolean;
  readonly readinessDelaysMs?: readonly number[];
  readonly participantId?: string;
  readonly onReadinessCheckError?: WaitForPartyCanSubmitOptions['onCheckError'];
  readonly signingContext?: CantonEd25519SigningContext;
  readonly requestTtlMs?: number;
  readonly now?: () => number;
  /**
   * Cancels signing, allocation transport, and post-allocation readiness reads. It cannot undo an allocation already
   * accepted by Canton.
   */
  readonly signal?: AbortSignal;
}

export interface CreatedExternalPartyWithEd25519Signer extends CreatedExternalPartyWithSigner {
  readonly signingRequest: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
  readonly status: ExternalPartyOnboardingStatus;
}

export class ExternalPartyOnboardingError extends Error {
  readonly reconciliation: ExternalPartyAllocationReconciliation;
  readonly signingRequest: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
  declare readonly cause: unknown;

  constructor(options: {
    readonly cause: unknown;
    readonly reconciliation: ExternalPartyAllocationReconciliation;
    readonly signingRequest: CantonEd25519SigningRequest;
    readonly signatureBase64: string;
  }) {
    super(`Canton external-party allocation ${options.reconciliation.failure.kind}`);
    this.name = 'ExternalPartyOnboardingError';
    this.cause = options.cause;
    this.reconciliation = options.reconciliation;
    this.signingRequest = options.signingRequest;
    this.signatureBase64 = options.signatureBase64;
  }
}

/** Thrown when Canton allocated the party but readiness confirmation or reconciliation did not complete. */
export class ExternalPartyPostAllocationError extends Error {
  readonly created: CreatedExternalPartyWithSigner;
  readonly signingRequest: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
  readonly status?: ExternalPartyOnboardingStatus;
  declare readonly cause: unknown;

  constructor(options: {
    readonly cause: unknown;
    readonly created: CreatedExternalPartyWithSigner;
    readonly signingRequest: CantonEd25519SigningRequest;
    readonly signatureBase64: string;
    readonly status?: ExternalPartyOnboardingStatus;
  }) {
    super('Canton external party was allocated but readiness confirmation failed');
    this.name = 'ExternalPartyPostAllocationError';
    this.cause = options.cause;
    this.created = options.created;
    this.signingRequest = options.signingRequest;
    this.signatureBase64 = options.signatureBase64;
    if (options.status !== undefined) this.status = options.status;
  }
}

/** Prepares, externally signs, verifies, allocates, and reconciles an Ed25519-controlled Canton party. */
export async function createExternalPartyWithEd25519Signer(
  options: CreateExternalPartyWithEd25519SignerOptions
): Promise<CreatedExternalPartyWithEd25519Signer> {
  const publicKeyBase64 = normalizeEd25519PublicKeyForCanton(options.signer.publicKeyBase64);
  const signedPayloads: Array<Awaited<ReturnType<typeof signAndVerifyCantonEd25519Payload>>> = [];
  let created: CreatedExternalPartyWithSigner;
  try {
    created = await createExternalPartyWithSigner({
      ledgerClient: options.ledgerClient,
      synchronizerId: options.synchronizerId,
      partyHint: options.partyHint,
      publicKeyBase64,
      ...(options.identityProviderId !== undefined ? { identityProviderId: options.identityProviderId } : {}),
      allowAlreadyExists: options.allowAlreadyExists ?? true,
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
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      async signMultiHash(request) {
        const signed = await signAndVerifyCantonEd25519Payload({
          signer: options.signer,
          purpose: CantonEd25519SigningPurpose.EXTERNAL_PARTY_TOPOLOGY,
          operationId: request.partyId,
          partyId: request.partyId,
          synchronizerId: request.synchronizerId,
          payloadHex: request.multiHashHex,
          ...(options.signingContext !== undefined ? { context: options.signingContext } : {}),
          ...(options.requestTtlMs !== undefined ? { requestTtlMs: options.requestTtlMs } : {}),
          ...(options.now !== undefined ? { now: options.now } : {}),
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        });
        signedPayloads.push(signed);
        return { signatureBase64: signed.signatureBase64 };
      },
    });
  } catch (cause) {
    const signed = signedPayloads[0];
    if (!signed) throw cause;
    // A plain AbortError is emitted only before mutation dispatch. Post-dispatch cancellation is wrapped as
    // UnknownMutationOutcomeError and must continue through exact-party reconciliation.
    if (isAbortError(cause)) throw cause;
    const allocationCause = cause instanceof ExternalPartyConflictReconciliationError ? cause.allocationError : cause;
    const reconcileOptions = {
      ledgerClient: options.ledgerClient,
      partyId: signed.request.partyId,
      publicKeyBase64,
      synchronizerId: signed.request.synchronizerId,
      error: allocationCause,
      expectSubmitReady: options.localParticipantObservationOnly !== true,
      ...(options.identityProviderId !== undefined ? { identityProviderId: options.identityProviderId } : {}),
      ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };
    let reconciliation: ExternalPartyAllocationReconciliation;
    try {
      reconciliation = await reconcileExternalPartyAllocationFailure(reconcileOptions);
    } catch (reconciliationCause) {
      if (!options.signal?.aborted) throw reconciliationCause;
      const failedAt =
        reconciliationCause instanceof ValidationError && reconciliationCause.context?.['step'] === 'readiness'
          ? 'readiness'
          : 'party-details';
      reconciliation = {
        failure: classifyExternalPartyAllocationFailure(allocationCause),
        status: {
          state: 'unknown',
          partyId: signed.request.partyId,
          publicKeyFingerprint: signed.request.publicKeyFingerprint,
          synchronizerId: signed.request.synchronizerId,
          exists: failedAt === 'readiness' ? true : null,
          ready: false,
          failedAt,
          failure: {
            name: reconciliationCause instanceof Error ? reconciliationCause.name : 'AbortError',
            message:
              reconciliationCause instanceof Error
                ? reconciliationCause.message
                : 'Canton external-party reconciliation was aborted',
          },
        },
      };
    }
    throw new ExternalPartyOnboardingError({
      cause,
      reconciliation,
      signingRequest: signed.request,
      signatureBase64: signed.signatureBase64,
    });
  }
  const signed = signedPayloads[0];
  if (!signed) {
    throw new OperationError(
      'External-party signer was not called during Canton party creation',
      OperationErrorCode.PARTY_CREATION_FAILED
    );
  }

  const expectSubmitReady = options.localParticipantObservationOnly !== true;
  const shouldWaitForReady = expectSubmitReady && (options.waitForReady ?? true);
  let status: ExternalPartyOnboardingStatus | undefined;
  try {
    const readyWithinWaitWindow = shouldWaitForReady
      ? await waitForPartyCanSubmit({
          ledgerClient: options.ledgerClient,
          party: created.partyId,
          synchronizerId: created.synchronizerId,
          ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
          ...(options.readinessDelaysMs !== undefined ? { delaysMs: options.readinessDelaysMs } : {}),
          ...(options.onReadinessCheckError !== undefined ? { onCheckError: options.onReadinessCheckError } : {}),
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        })
      : null;

    status = await reconcileExternalPartyOnboarding({
      ledgerClient: options.ledgerClient,
      partyId: created.partyId,
      publicKeyBase64,
      synchronizerId: created.synchronizerId,
      ...(options.identityProviderId !== undefined ? { identityProviderId: options.identityProviderId } : {}),
      ...(options.participantId !== undefined ? { participantId: options.participantId } : {}),
      expectSubmitReady,
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });

    if (shouldWaitForReady && status.state !== 'ready') {
      throw new OperationError(
        'Canton external party is not confirmed submit-ready on the requested synchronizer',
        OperationErrorCode.MISSING_DOMAIN_ID,
        {
          party: created.partyId,
          synchronizerId: created.synchronizerId,
          readyWithinWaitWindow,
          status,
        }
      );
    }

    return {
      ...created,
      signingRequest: signed.request,
      signatureBase64: signed.signatureBase64,
      status,
    };
  } catch (cause) {
    throw new ExternalPartyPostAllocationError({
      cause,
      created,
      signingRequest: signed.request,
      signatureBase64: signed.signatureBase64,
      ...(status !== undefined ? { status } : {}),
    });
  }
}

export interface ExecuteExternalTransactionWithEd25519SignerOptions extends Omit<
  PrepareExternalTransactionOptions,
  'actAs' | 'commandId'
> {
  readonly partyId: string;
  readonly signer: CantonEd25519Signer;
  readonly commandId: string;
  readonly submissionId: string;
  readonly deduplicationPeriod?: ExecuteExternalTransactionOptions['deduplicationPeriod'];
  readonly signingContext?: CantonEd25519SigningContext;
  readonly requestTtlMs?: number;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

export type ExternalTransactionResubmission = Omit<
  ExecuteExternalTransactionOptions,
  'ledgerClient' | 'hashingSchemeVersion' | 'deduplicationPeriod'
> & {
  readonly hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
  readonly deduplicationPeriod: NonNullable<ExecuteExternalTransactionOptions['deduplicationPeriod']>;
};

export class ExternalTransactionSubmissionError extends Error {
  readonly kind: 'definite-rejection' | 'ambiguous';
  readonly definite: boolean;
  readonly partyId: string;
  readonly commandId: string;
  readonly submissionId: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
  readonly prepared: PrepareExternalTransactionResult;
  readonly resubmission: ExternalTransactionResubmission;
  readonly signingRequest: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
  readonly status?: number;
  readonly code?: string;
  declare readonly cause: unknown;

  constructor(options: {
    readonly cause: unknown;
    readonly partyId: string;
    readonly commandId: string;
    readonly submissionId: string;
    readonly prepared: PrepareExternalTransactionResult;
    readonly preparedTransactionHashHex: string;
    readonly resubmission: ExternalTransactionResubmission;
    readonly signingRequest: CantonEd25519SigningRequest;
    readonly signatureBase64: string;
  }) {
    const normalized = normalizeCantonError(options.cause);
    const definite = readCantonDefiniteAnswer(options.cause) ?? isDefiniteCantonMutationRejection(options.cause);
    super(`Canton interactive submission ${definite ? 'was rejected' : 'has an ambiguous outcome'}`);
    this.name = 'ExternalTransactionSubmissionError';
    this.cause = options.cause;
    this.kind = definite ? 'definite-rejection' : 'ambiguous';
    this.definite = definite;
    this.partyId = options.partyId;
    this.commandId = options.commandId;
    this.submissionId = options.submissionId;
    this.preparedTransaction = options.resubmission.preparedTransaction;
    this.preparedTransactionHashHex = options.preparedTransactionHashHex;
    this.hashingSchemeVersion = options.resubmission.hashingSchemeVersion;
    this.prepared = options.prepared;
    this.resubmission = options.resubmission;
    this.signingRequest = options.signingRequest;
    this.signatureBase64 = options.signatureBase64;
    if (normalized?.status !== undefined) this.status = normalized.status;
    if (normalized?.code !== undefined) this.code = normalized.code;
  }
}

export interface ExecutedExternalTransactionWithEd25519Signer {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  readonly synchronizerId: string;
  readonly commandId: string;
  readonly submissionId: string;
  readonly preparedTransactionHashHex: string;
  readonly prepared: PrepareExternalTransactionResult;
  readonly signingRequest: CantonEd25519SigningRequest;
  readonly signatureBase64: string;
  readonly submitted: ExecuteExternalTransactionAndWaitResult;
}

/** Prepares a single-party interactive submission, externally signs and verifies it, then executes and waits. */
export async function executeExternalTransactionWithEd25519Signer(
  options: ExecuteExternalTransactionWithEd25519SignerOptions
): Promise<ExecutedExternalTransactionWithEd25519Signer> {
  assertCantonPartyMatchesPublicKey({
    partyId: options.partyId,
    publicKeyBase64: options.signer.publicKeyBase64,
  });
  const prepared = await prepareExternalTransaction({
    ledgerClient: options.ledgerClient,
    commands: options.commands,
    userId: options.userId,
    actAs: [options.partyId],
    synchronizerId: options.synchronizerId,
    commandId: options.commandId,
    ...(options.readAs !== undefined ? { readAs: options.readAs } : {}),
    ...(options.disclosedContracts !== undefined ? { disclosedContracts: options.disclosedContracts } : {}),
    ...(options.verboseHashing !== undefined ? { verboseHashing: options.verboseHashing } : {}),
    ...(options.packageIdSelectionPreference !== undefined
      ? { packageIdSelectionPreference: options.packageIdSelectionPreference }
      : {}),
  });
  const preparedTransaction = readRequiredString(prepared, 'preparedTransaction', 'interactive submission prepare');
  const preparedTransactionHashHex = preparedTransactionHashToHex(
    prepared.preparedTransactionHash,
    'interactive submission prepare'
  );
  const { hashingSchemeVersion } = prepared;
  const signed = await signAndVerifyCantonEd25519Payload({
    signer: options.signer,
    purpose: CantonEd25519SigningPurpose.INTERACTIVE_SUBMISSION,
    operationId: prepared.commandId,
    partyId: options.partyId,
    synchronizerId: options.synchronizerId,
    payloadHex: preparedTransactionHashHex,
    ...(options.signingContext !== undefined ? { context: options.signingContext } : {}),
    ...(options.requestTtlMs !== undefined ? { requestTtlMs: options.requestTtlMs } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  const { submissionId } = options;
  const resubmission: ExternalTransactionResubmission = {
    userId: options.userId,
    preparedTransaction,
    hashingSchemeVersion,
    submissionId,
    deduplicationPeriod: options.deduplicationPeriod ?? createDefaultInteractiveSubmissionDeduplicationPeriod(),
    partySignatures: [
      {
        party: options.partyId,
        signatures: [
          {
            signature: signed.signatureBase64,
            signedBy: signed.request.publicKeyFingerprint,
            format: CANTON_RAW_SIGNATURE_FORMAT,
            signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
          },
        ],
      },
    ],
  };
  let submitted: ExecuteExternalTransactionAndWaitResult;
  try {
    submitted = await executeExternalTransactionAndWait({
      ledgerClient: options.ledgerClient,
      ...resubmission,
    });
  } catch (cause) {
    throw new ExternalTransactionSubmissionError({
      cause,
      partyId: options.partyId,
      commandId: prepared.commandId,
      submissionId,
      prepared,
      preparedTransactionHashHex,
      resubmission,
      signingRequest: signed.request,
      signatureBase64: signed.signatureBase64,
    });
  }

  return {
    partyId: options.partyId,
    publicKeyFingerprint: signed.request.publicKeyFingerprint,
    synchronizerId: options.synchronizerId,
    commandId: prepared.commandId,
    submissionId,
    preparedTransactionHashHex,
    prepared,
    signingRequest: signed.request,
    signatureBase64: signed.signatureBase64,
    submitted,
  };
}
