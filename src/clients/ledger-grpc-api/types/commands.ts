/**
 * Command types from the Ledger API protobufs. These types correspond to com.daml.ledger.api.v2.commands.proto
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

import type { DamlRecord, Identifier, Value } from './value';

/** Create a new contract instance based on a template. */
export interface CreateCommand {
  /** The template of contract to create. */
  templateId: Identifier;
  /** The arguments required for creating the contract. */
  createArguments: DamlRecord;
}

/** Exercise a choice on an existing contract. */
export interface ExerciseCommand {
  /** The template or interface of the contract. */
  templateId: Identifier;
  /** The ID of the contract to exercise upon. */
  contractId: string;
  /** The name of the choice to exercise. */
  choice: string;
  /** The argument for this choice. */
  choiceArgument: Value;
}

/** Exercise a choice on a contract specified by its key. */
export interface ExerciseByKeyCommand {
  /** The template of contract. */
  templateId: Identifier;
  /** The key of the contract. */
  contractKey: Value;
  /** The name of the choice to exercise. */
  choice: string;
  /** The argument for this choice. */
  choiceArgument: Value;
}

/** Create a contract and exercise a choice on it in the same transaction. */
export interface CreateAndExerciseCommand {
  /** The template of the contract to create. */
  templateId: Identifier;
  /** The arguments required for creating the contract. */
  createArguments: DamlRecord;
  /** The name of the choice to exercise. */
  choice: string;
  /** The argument for this choice. */
  choiceArgument: Value;
}

/** A single command (one of the command types). */
export interface Command {
  create?: CreateCommand;
  exercise?: ExerciseCommand;
  exerciseByKey?: ExerciseByKeyCommand;
  createAndExercise?: CreateAndExerciseCommand;
}

/** An additional contract used to resolve contract & contract key lookups. */
export interface DisclosedContract {
  /** The template id of the contract. */
  templateId?: Identifier;
  /** The contract id. */
  contractId?: string;
  /** Opaque byte string containing the complete payload. */
  createdEventBlob: Uint8Array;
  /** The ID of the synchronizer where the contract is assigned. */
  synchronizerId?: string;
}

/** Prefetch contract key to speed up command processing. */
export interface PrefetchContractKey {
  /** The template of contract to prefetch. */
  templateId: Identifier;
  /** The key of the contract to prefetch. */
  contractKey: Value;
}

/** A composite command that groups multiple commands together. */
export interface Commands {
  /** Identifier of the on-ledger workflow. */
  workflowId?: string;
  /** Uniquely identifies the participant user. */
  userId: string;
  /** Uniquely identifies the command. */
  commandId: string;
  /** Individual elements of this atomic command. */
  commands: Command[];
  /** Deduplication duration in nanoseconds. */
  deduplicationDuration?: { seconds: number; nanos: number };
  /** Deduplication offset. */
  deduplicationOffset?: number;
  /** Lower bound for ledger time (absolute). */
  minLedgerTimeAbs?: { seconds: number; nanos: number };
  /** Lower bound for ledger time (relative). */
  minLedgerTimeRel?: { seconds: number; nanos: number };
  /** Parties on whose behalf the command should be executed. */
  actAs: string[];
  /** Parties on whose behalf contracts can be retrieved. */
  readAs?: string[];
  /** Unique identifier for this submission. */
  submissionId?: string;
  /** Additional contracts used to resolve lookups. */
  disclosedContracts?: DisclosedContract[];
  /** The synchronizer id. */
  synchronizerId?: string;
  /** Package-id selection preference. */
  packageIdSelectionPreference?: string[];
  /** Contract keys to prefetch. */
  prefetchContractKeys?: PrefetchContractKey[];
}

/** Helper to create a CreateCommand. */
export function createCreateCommand(templateId: Identifier, createArguments: DamlRecord): Command {
  return { create: { templateId, createArguments } };
}

/** Helper to create an ExerciseCommand. */
export function createExerciseCommand(
  templateId: Identifier,
  contractId: string,
  choice: string,
  choiceArgument: Value
): Command {
  return { exercise: { templateId, contractId, choice, choiceArgument } };
}

/** Helper to create a CreateAndExerciseCommand. */
export function createCreateAndExerciseCommand(
  templateId: Identifier,
  createArguments: DamlRecord,
  choice: string,
  choiceArgument: Value
): Command {
  return { createAndExercise: { templateId, createArguments, choice, choiceArgument } };
}
