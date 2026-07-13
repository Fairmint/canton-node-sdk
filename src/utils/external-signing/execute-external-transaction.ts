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

/** Immutable compatibility value. Use the factory below when building a submission request. */
export const DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD = Object.freeze({
  DeduplicationDuration: Object.freeze({
    value: Object.freeze({ seconds: 30, nanos: 0 }),
  }),
}) satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;

/** Returns an isolated default deduplication period for one interactive submission. */
export function createDefaultInteractiveSubmissionDeduplicationPeriod(): {
  DeduplicationDuration: { value: { seconds: number; nanos: number } };
} {
  return {
    DeduplicationDuration: {
      value: {
        seconds: DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD.DeduplicationDuration.value.seconds,
        nanos: DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD.DeduplicationDuration.value.nanos,
      },
    },
  } satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;
}

export interface ExecuteExternalTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly userId?: string;
  readonly preparedTransaction: string;
  readonly submissionId: string;
  readonly partySignatures: NonEmptyPartySignatures;
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
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
