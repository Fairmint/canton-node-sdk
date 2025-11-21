import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';

export type PartySignature = InteractiveSubmissionExecuteRequest['partySignatures']['signatures'][number];

export interface ExecuteExternalTransactionOptions {
  ledgerClient: LedgerJsonApiClient;
  userId: string;
  preparedTransaction: string;
  submissionId: string;
  partySignatures: PartySignature[];
  hashingSchemeVersion?: string;
  deduplicationPeriod?: InteractiveSubmissionExecuteRequest['deduplicationPeriod'];
}

/** Submit a previously prepared and externally signed interactive submission to the ledger. */
export async function executeExternalTransaction(
  options: ExecuteExternalTransactionOptions
): Promise<InteractiveSubmissionExecuteResponse> {
  return await options.ledgerClient.interactiveSubmissionExecute({
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
      signatures: options.partySignatures,
    },
  });
}
