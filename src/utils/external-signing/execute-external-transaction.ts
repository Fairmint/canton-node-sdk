import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';

export type PartySignature = InteractiveSubmissionExecuteRequest['partySignatures']['signatures'][number];

/** Immutable compatibility value. Use the factory below when building a submission request. */
export const DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD = Object.freeze({
  DeduplicationDuration: Object.freeze({
    value: Object.freeze({ duration: '30s' }),
  }),
}) satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;

/** Returns an isolated default deduplication period for one interactive submission. */
export function createDefaultInteractiveSubmissionDeduplicationPeriod(): {
  DeduplicationDuration: { value: { duration: string } };
} {
  return {
    DeduplicationDuration: {
      value: { duration: DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD.DeduplicationDuration.value.duration },
    },
  } satisfies NonNullable<InteractiveSubmissionExecuteRequest['deduplicationPeriod']>;
}

export interface ExecuteExternalTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly userId: string;
  readonly preparedTransaction: string;
  readonly submissionId: string;
  readonly partySignatures: readonly PartySignature[];
  readonly hashingSchemeVersion?: string;
  readonly deduplicationPeriod?: InteractiveSubmissionExecuteRequest['deduplicationPeriod'];
}

export interface ExecuteExternalTransactionAndWaitResult {
  readonly updateId: string;
  readonly raw: Record<string, unknown>;
}

/**
 * Executes an interactive submission after offline signing (`interactiveSubmissionExecute`).
 *
 * @param options - Prepared blob from {@link prepareExternalTransaction}, submission id, per-party signatures
 * @returns Validator response payload from interactive submission execute
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
  const raw = await options.ledgerClient.makePostRequest<unknown>(
    `${options.ledgerClient.getApiUrl()}/v2/interactive-submission/executeAndWait`,
    buildExecuteExternalTransactionRequest(options),
    {
      contentType: 'application/json',
      includeBearerToken: true,
    }
  );
  const updateId = readRequiredString(raw, 'updateId', 'interactive submission executeAndWait');
  return {
    updateId,
    raw: objectOrEmpty(raw),
  };
}

function buildExecuteExternalTransactionRequest(
  options: ExecuteExternalTransactionOptions
): InteractiveSubmissionExecuteRequest {
  return {
    userId: options.userId,
    preparedTransaction: options.preparedTransaction,
    hashingSchemeVersion: options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2',
    submissionId: options.submissionId,
    deduplicationPeriod: options.deduplicationPeriod ?? createDefaultInteractiveSubmissionDeduplicationPeriod(),
    partySignatures: {
      signatures: [...options.partySignatures],
    },
  };
}
