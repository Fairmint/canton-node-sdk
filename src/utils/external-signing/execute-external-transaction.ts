import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import { OperationError, OperationErrorCode } from '../../core/errors';

export type PartySignature = InteractiveSubmissionExecuteRequest['partySignatures']['signatures'][number];

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
    deduplicationPeriod: options.deduplicationPeriod ?? {
      DeduplicationDuration: {
        value: { duration: '30s' },
      },
    },
    partySignatures: {
      signatures: [...options.partySignatures],
    },
  };
}

function readRequiredString(source: unknown, key: string, operation: string): string {
  if (isRecord(source) && key in source) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  throw new OperationError(
    `Canton ${operation} response did not include ${key}`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
