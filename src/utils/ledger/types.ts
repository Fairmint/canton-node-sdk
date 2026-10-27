/**
 * Shared types for reading contracts and submitting commands through the Ledger JSON API.
 *
 * `LedgerCommand` mirrors the API's command JSON with `Record<string, unknown>` arguments, so callers can build
 * commands for templates the SDK has no generated types for (for example Digital Asset's proprietary Registry DARs).
 * The schema-typed counterparts (`CreateCommand`, `CompositeCommand`, …) are exported from the package root too;
 * `LedgerCommand` is the ergonomic variant for hand-built commands, converted at the submission boundary.
 */
import { type DisclosedContract } from '../../clients';

export type { DisclosedContract };

/** A contract as read from the active contract set, in package-id form (`<packageId>:<Module>:<Entity>`). */
export interface ActiveContract {
  contractId: string;
  templateId: string;
  createArgument: Record<string, unknown>;
  createdEventBlob?: string;
  synchronizerId: string;
}

export type LedgerCommand =
  | {
      CreateCommand: { templateId: string; createArguments: Record<string, unknown> };
    }
  | {
      ExerciseCommand: {
        templateId: string;
        contractId: string;
        choice: string;
        choiceArgument: Record<string, unknown>;
      };
    }
  | {
      CreateAndExerciseCommand: {
        templateId: string;
        createArguments: Record<string, unknown>;
        choice: string;
        choiceArgument: Record<string, unknown>;
      };
    };

export interface LedgerSubmission {
  /**
   * Stable prefix identifying the logical action (for example one setup step); the submit helper appends a random
   * suffix per submission so re-runs do not collide on the ledger's command-id deduplication.
   */
  commandIdPrefix: string;
  actAs: string[];
  commands: LedgerCommand[];
  disclosedContracts?: DisclosedContract[];
}

export interface CreatedContract {
  contractId: string;
  templateId: string;
}

export interface SubmittedTransaction {
  updateId: string;
  created: CreatedContract[];
}

/** The package version a name resolves to for a set of parties on a synchronizer. */
export interface PreferredPackage {
  packageName: string;
  packageId: string;
  packageVersion: string;
}
