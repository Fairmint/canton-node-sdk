import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';

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

/**
 * Executes an interactive submission after offline signing (`interactiveSubmissionExecute`).
 *
 * @param options - Prepared blob from {@link prepareExternalTransaction}, submission id, per-party signatures
 * @returns Validator response payload from interactive submission execute
 */
export async function executeExternalTransaction(
  options: ExecuteExternalTransactionOptions
): Promise<InteractiveSubmissionExecuteResponse> {
  return options.ledgerClient.interactiveSubmissionExecute({
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
  });
}
