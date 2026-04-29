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

/**
 * Runs interactive submission **prepare** so payloads can be signed offline (`interactiveSubmissionPrepare`).
 *
 * @param options - Ledger client, commands, identity (`userId`, `actAs`), synchronizer scope, optional disclosures
 * @returns Prepared transaction blob plus echoed `commandId`
 *
 * @example
 * ```ts
 * const prepared = await prepareExternalTransaction({
 *   ledgerClient,
 *   commands: [{ ExerciseCommand: { … } }],
 *   userId,
 *   actAs: [partyId],
 *   synchronizerId,
 * });
 * ```
 */
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
