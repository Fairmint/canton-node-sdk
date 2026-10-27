import { randomUUID } from 'crypto';
import { type LedgerJsonApiClient } from '../../clients';
import { extractEventsFromTransaction } from '../parsers';
import { type LedgerSubmission, type SubmittedTransaction } from './types';

export interface SubmitLedgerCommandsOptions {
  /** Every command is pinned to this synchronizer. */
  synchronizerId: string;
  /**
   * Package ids the participant prefers when resolving package-name-form template ids. Pinning the packages both
   * confirming nodes vet keeps a multi-node workflow (for example a registrar and its operator) on the same code.
   */
  packageIdSelectionPreference?: readonly string[];
}

/**
 * Submits commands and waits for the resulting transaction, returning its update id and created contracts.
 *
 * The command id is `${commandIdPrefix}-${randomUUID()}`: callers keep a stable, searchable prefix per logical action
 * while each submission stays unique.
 */
export async function submitLedgerCommands(
  client: LedgerJsonApiClient,
  submission: LedgerSubmission,
  options: SubmitLedgerCommandsOptions
): Promise<SubmittedTransaction> {
  const response = await client.submitAndWaitForTransaction({
    // LedgerCommand mirrors the API's JSON shapes with Record<string, unknown> arguments; the client's zod-inferred
    // parameter type uses a recursive JsonValue, so the structurally-equal commands need this one cast.
    commands: submission.commands as Parameters<LedgerJsonApiClient['submitAndWaitForTransaction']>[0]['commands'],
    commandId: `${submission.commandIdPrefix}-${randomUUID()}`,
    actAs: submission.actAs,
    synchronizerId: options.synchronizerId,
    ...(options.packageIdSelectionPreference && options.packageIdSelectionPreference.length > 0
      ? { packageIdSelectionPreference: [...options.packageIdSelectionPreference] }
      : {}),
    ...(submission.disclosedContracts && submission.disclosedContracts.length > 0
      ? { disclosedContracts: submission.disclosedContracts }
      : {}),
  });
  const events = extractEventsFromTransaction(response);
  const updateId = (response as { transaction?: { updateId?: string } }).transaction?.updateId ?? '';
  return {
    updateId,
    created: events.created.map((e) => ({ contractId: e.contractId, templateId: e.templateId })),
  };
}
