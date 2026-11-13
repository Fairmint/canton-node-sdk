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

/** One interface view of an active contract (only views the ledger computed successfully are kept). */
export interface InterfaceView {
  readonly interfaceId: string;
  readonly viewValue: JsonObject;
}

/** An active contract read from the wallet party's ACS. */
export interface ActiveContract {
  readonly contractId: string;
  /** As the ledger reports it: usually the package-id form `pkgId:Module:Entity`. */
  readonly templateId: string;
  /** The template's package name (`utility-registry-holding-v0`), when the ledger reported it. */
  readonly packageName?: string;
  /**
   * The parties that signed the contract. Only these are guaranteed: anyone can create a contract of their own package
   * with any create argument or interface view, so trust in a contract comes from who signed it.
   */
  readonly signatories: readonly string[];
  /** Null when the ledger did not include it (for example for an interface filter). */
  readonly createArgument: JsonObject | null;
  readonly interfaceViews: readonly InterfaceView[];
  readonly createdEventBlob?: string;
  /** The synchronizer the contract is assigned to, when the ledger reported it. */
  readonly synchronizerId?: string;
}

/** Which contracts to read: one template or one interface (package-name `#pkg:Module:Entity` form). */
export type ContractFilter = { readonly templateId: string } | { readonly interfaceId: string };

/** What the SDK asks the wallet to sign and submit, acting as the wallet party only. */
export interface WalletSubmission {
  readonly commands: readonly LedgerCommand[];
  readonly disclosedContracts?: readonly DisclosedContract[];
  /** Deduplication key; a random UUID when omitted. */
  readonly commandId?: string;
}

/** A committed submission. */
export interface SubmitResult {
  readonly updateId: string;
  readonly commandId?: string;
}
