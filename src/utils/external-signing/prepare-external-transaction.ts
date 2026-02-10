import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionPrepareRequest,
  type InteractiveSubmissionPrepareResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';

export interface PrepareExternalTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly commands: InteractiveSubmissionPrepareRequest['commands'];
  readonly userId: string;
  readonly actAs: readonly string[];
  readonly synchronizerId: string;
  readonly commandId?: string;
  readonly readAs?: readonly string[];
  readonly disclosedContracts?: InteractiveSubmissionPrepareRequest['disclosedContracts'];
  readonly verboseHashing?: boolean;
  readonly packageIdSelectionPreference?: InteractiveSubmissionPrepareRequest['packageIdSelectionPreference'];
}

export interface PrepareExternalTransactionResult extends InteractiveSubmissionPrepareResponse {
  readonly commandId: string;
}

/** Convenience helper for preparing an interactive submission that will be signed off-ledger. */
export async function prepareExternalTransaction(
  options: PrepareExternalTransactionOptions
): Promise<PrepareExternalTransactionResult> {
  const commandId = options.commandId ?? randomUUID();

  const response = await options.ledgerClient.interactiveSubmissionPrepare({
    commands: options.commands,
    commandId,
    userId: options.userId,
    actAs: [...options.actAs],
    readAs: options.readAs ? [...options.readAs] : [],
    disclosedContracts: options.disclosedContracts,
    synchronizerId: options.synchronizerId,
    verboseHashing: options.verboseHashing ?? false,
    packageIdSelectionPreference: options.packageIdSelectionPreference ?? [],
  });

  return {
    ...response,
    commandId,
  };
}
