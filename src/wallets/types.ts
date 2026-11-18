/** Ledger JSON API v2 shapes a wallet submits and reads, kept self-contained so the module stays browser-safe. */
import type { JsonObject } from './json';

/** A CIP-56 instrument: the registrar (`admin`) and its instrument id. */
export interface InstrumentId {
  readonly admin: string;
  readonly id: string;
}

/** `{ CreateCommand }` as the Ledger JSON API v2 spells it. */
export interface CreateCommand {
  readonly CreateCommand: {
    readonly templateId: string;
    readonly createArguments: JsonObject;
  };
}

/** `{ ExerciseCommand }` as the Ledger JSON API v2 spells it. */
export interface ExerciseCommand {
  readonly ExerciseCommand: {
    readonly templateId: string;
    readonly contractId: string;
    readonly choice: string;
    readonly choiceArgument: JsonObject;
  };
}

export type LedgerCommand = CreateCommand | ExerciseCommand;

/** A contract the submitting participant cannot see, supplied with the submission. */
export interface DisclosedContract {
  readonly contractId: string;
  readonly templateId: string;
  readonly createdEventBlob: string;
  readonly synchronizerId?: string;
}

/** An active contract read from the wallet party's ACS. */
export interface ActiveContract {
  readonly contractId: string;
  /** As the ledger reports it: usually the package-id form `pkgId:Module:Entity`. */
  readonly templateId: string;
  /** The template's package name (`utility-registry-holding-v0`); entries without one are not read. */
  readonly packageName: string;
  /**
   * The parties that signed the contract. Only these are guaranteed: anyone can create a contract of their own package
   * with any create argument, so trust in a contract comes from who signed it.
   */
  readonly signatories: readonly string[];
  /** Null when the ledger did not include it. */
  readonly createArgument: JsonObject | null;
  /** The synchronizer the contract is assigned to, when the ledger reported it. */
  readonly synchronizerId?: string;
}

/** What the SDK asks the wallet to sign and submit, acting as the wallet party only. */
export interface WalletSubmission {
  readonly commands: readonly LedgerCommand[];
  readonly disclosedContracts?: readonly DisclosedContract[];
}

/** A committed submission. */
export interface SubmitResult {
  readonly updateId: string;
  /** The command id the submission was sent with (a random UUID). */
  readonly commandId: string;
}
