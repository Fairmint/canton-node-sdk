import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionExecuteAndWaitResponse,
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import { ValidationError } from '../../core/errors';

type GeneratedPartySignature = InteractiveSubmissionExecuteRequest['partySignatures']['signatures'][number];
type GeneratedSignature = GeneratedPartySignature['signatures'][number];

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];
export type PartySignature = Omit<GeneratedPartySignature, 'signatures'> & {
  readonly signatures: NonEmptyReadonlyArray<GeneratedSignature>;
};
export type NonEmptyPartySignatures = NonEmptyReadonlyArray<PartySignature>;
export type InteractiveSubmissionHashingSchemeVersion = InteractiveSubmissionExecuteRequest['hashingSchemeVersion'];

/** A deduplication period as a duration, in the Ledger JSON API's `DeduplicationDuration` form. */
export interface InteractiveSubmissionDeduplicationDuration {
  DeduplicationDuration: { value: { seconds: number; nanos: number } };
}

/**
 * The default deduplication period of an interactive (externally signed) submission: 10 minutes.
 *
 * The participant refuses to execute a transaction whose command id (with the same user and acting parties) it already
 * accepted within this period, so a signed transaction replayed within it (a retried request, a second server instance
 * holding the same signed payload) is refused as a duplicate instead of running twice. It must cover how long a signed
 * payload can still be submitted: 10 minutes covers a 5-minute prepared-transaction or approval token plus 5 minutes of
 * clock skew and retries. Longer-lived payloads need a longer period: pass `deduplicationPeriodFromMs(lifetimeMs +
 * marginMs)`.
 *
 * A longer period only refuses true duplicates (the same command id, accepted before): a rejected submission does not
 * count, so it can still be retried. The participant does not cap a duration (with no period at all, it applies its
 * whole `max-deduplication-duration`, 7 days by default); it refuses one only when it pruned within the period
 * (`DEDUPLICATION_PERIOD_STARTS_TOO_EARLY`), and it does not prune within its `max-deduplication-duration`.
 */
export const DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS = 10 * 60 * 1000;

const MS_PER_SECOND = 1000;
const NANOS_PER_MS = 1_000_000;

/**
 * A deduplication period of `ms` milliseconds, for `deduplicationPeriod`: for example `deduplicationPeriodFromMs(15 *
 * 60_000)` for a signed payload that lives 10 minutes, plus 5 minutes of margin.
 *
 * @throws ValidationError when `ms` is not a finite, non-negative whole number of milliseconds
 */
export function deduplicationPeriodFromMs(ms: number): InteractiveSubmissionDeduplicationDuration {
  if (typeof ms !== 'number' || !Number.isSafeInteger(ms) || ms < 0) {
    throw new ValidationError(
      `A deduplication period must be a non-negative whole number of milliseconds, not ${String(ms)}`
    );
  }
  return {
    DeduplicationDuration: {
      value: { seconds: Math.floor(ms / MS_PER_SECOND), nanos: (ms % MS_PER_SECOND) * NANOS_PER_MS },
    },
  } satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;
}

/**
 * Immutable value of the default deduplication period ({@link DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS}). Use the
 * factory below when building a submission request.
 */
export const DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD = Object.freeze({
  DeduplicationDuration: Object.freeze({
    value: Object.freeze({ seconds: DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS / MS_PER_SECOND, nanos: 0 }),
  }),
}) satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;

/** Returns an isolated default deduplication period for one interactive submission. */
export function createDefaultInteractiveSubmissionDeduplicationPeriod(): InteractiveSubmissionDeduplicationDuration {
  return deduplicationPeriodFromMs(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS);
}

export interface ExecuteExternalTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly userId?: string;
  readonly preparedTransaction: string;
  readonly submissionId: string;
  readonly partySignatures: NonEmptyPartySignatures;
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  /**
   * How long the participant refuses a second execution of this command id: defaults to 10 minutes
   * ({@link DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS}). Cover the signed payload's whole lifetime, with
   * {@link deduplicationPeriodFromMs}.
   */
  readonly deduplicationPeriod?: InteractiveSubmissionExecuteRequest['deduplicationPeriod'];
  readonly minLedgerTime?: InteractiveSubmissionExecuteRequest['minLedgerTime'];
}

export type ExecuteExternalTransactionAndWaitResult = InteractiveSubmissionExecuteAndWaitResponse & {
  /** Original validated Ledger response retained for existing helper composition. */
  readonly raw: InteractiveSubmissionExecuteAndWaitResponse;
};

/**
 * Executes an interactive submission after offline signing (`interactiveSubmissionExecute`).
 *
 * @param options - Prepared blob from {@link prepareExternalTransaction}, submission id, per-party signatures
 * @returns Empty success payload from the Ledger interactive submission execute endpoint
 */
export async function executeExternalTransaction(
  options: ExecuteExternalTransactionOptions
): Promise<InteractiveSubmissionExecuteResponse> {
  return options.ledgerClient.interactiveSubmissionExecute(buildExecuteExternalTransactionRequest(options));
}

/**
 * Executes an interactive submission and waits for the resulting update id.
 *
 * This uses Ledger JSON API's `executeAndWait` endpoint, which is useful for applications that need to link users to a
 * transaction/update explorer after an externally signed submission.
 */
export async function executeExternalTransactionAndWait(
  options: ExecuteExternalTransactionOptions
): Promise<ExecuteExternalTransactionAndWaitResult> {
  const response = await options.ledgerClient.interactiveSubmissionExecuteAndWait(
    buildExecuteExternalTransactionRequest(options)
  );
  return { ...response, raw: response };
}

function buildExecuteExternalTransactionRequest(
  options: ExecuteExternalTransactionOptions
): InteractiveSubmissionExecuteRequest {
  const [firstPartySignature, ...remainingPartySignatures] = options.partySignatures;
  const toRequestPartySignature = ({ party, signatures }: PartySignature): GeneratedPartySignature => ({
    party,
    signatures: [...signatures],
  });

  return {
    preparedTransaction: options.preparedTransaction,
    hashingSchemeVersion: normalizeHashingSchemeVersion(options.hashingSchemeVersion),
    submissionId: options.submissionId,
    deduplicationPeriod: options.deduplicationPeriod ?? createDefaultInteractiveSubmissionDeduplicationPeriod(),
    partySignatures: {
      signatures: [
        toRequestPartySignature(firstPartySignature),
        ...remainingPartySignatures.map(toRequestPartySignature),
      ],
    },
    ...(options.userId !== undefined ? { userId: options.userId } : {}),
    ...(options.minLedgerTime !== undefined ? { minLedgerTime: options.minLedgerTime } : {}),
  };
}

function normalizeHashingSchemeVersion(
  value: InteractiveSubmissionHashingSchemeVersion | undefined
): InteractiveSubmissionHashingSchemeVersion {
  const resolved: unknown = value ?? 'HASHING_SCHEME_VERSION_V2';
  if (resolved === 'HASHING_SCHEME_VERSION_V2' || resolved === 'HASHING_SCHEME_VERSION_V3') {
    return resolved;
  }
  throw new ValidationError(`Unsupported interactive-submission hashing scheme: ${String(resolved)}`);
}
