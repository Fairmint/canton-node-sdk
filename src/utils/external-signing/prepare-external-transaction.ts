import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type InteractiveSubmissionPrepareRequest,
  type InteractiveSubmissionPrepareResponse,
} from '../../clients/ledger-json-api/schemas/api/interactive-submission';

export type PrepareExternalTransactionCommand = InteractiveSubmissionPrepareRequest['commands'][number];
/** Pinned interactive preparation accepts exactly one command. */
export type NonEmptyPrepareExternalTransactionCommands = readonly [PrepareExternalTransactionCommand];
export type NonEmptyActAsParties = readonly [string, ...string[]];

export interface PrepareExternalTransactionOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly commands: NonEmptyPrepareExternalTransactionCommands;
  readonly userId: string;
  readonly actAs: NonEmptyActAsParties;
  readonly synchronizerId: string;
  /** Hashing scheme to request. Omission preserves the pinned Ledger default (V2). */
  readonly hashingSchemeVersion?: NonNullable<InteractiveSubmissionPrepareRequest['hashingSchemeVersion']>;
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
 * @example
 *   ```ts
 *   const prepared = await prepareExternalTransaction({
 *     ledgerClient,
 *     commands: [{ ExerciseCommand: { … } }],
 *     userId,
 *     actAs: [partyId],
 *     synchronizerId,
 *     hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
 *   });
 *   ```;
 *
 * @param options - Ledger client, commands, identity (`userId`, `actAs`), synchronizer scope, optional disclosures
 * @returns Prepared transaction blob plus echoed `commandId`
 */
export async function prepareExternalTransaction(
  options: PrepareExternalTransactionOptions
): Promise<PrepareExternalTransactionResult> {
  const commandId = options.commandId ?? randomUUID();

  const response = await options.ledgerClient.interactiveSubmissionPrepare({
    commands: [options.commands[0]],
    commandId,
    userId: options.userId,
    actAs: [...options.actAs],
    readAs: options.readAs ? [...options.readAs] : [],
    synchronizerId: options.synchronizerId,
    hashingSchemeVersion: options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2',
    verboseHashing: options.verboseHashing ?? false,
    packageIdSelectionPreference: options.packageIdSelectionPreference ?? [],
    ...(options.disclosedContracts !== undefined ? { disclosedContracts: options.disclosedContracts } : {}),
  });

  return {
    ...response,
    commandId,
  };
}
