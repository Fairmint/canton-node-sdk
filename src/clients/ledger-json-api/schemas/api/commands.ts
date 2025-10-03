import { z } from 'zod';
import { RecordSchema } from '../base';
import {
  DeduplicationDurationSchema,
  DeduplicationOffsetSchema,
  EmptyDeduplicationSchema,
  MinLedgerTimeRelSchema,
  PrefetchContractKeySchema,
} from '../common';

export const CreateCommandSchema = z
  .object({
    /** Command to create a new contract instance. */
    CreateCommand: z
      .object({
        /** Template ID of the contract to create. */
        templateId: z.string(),
        /** Arguments for the contract creation. */
        createArguments: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const ExerciseCommandSchema = z
  .object({
    /** Command to exercise a choice on an existing contract. */
    ExerciseCommand: z
      .object({
        /** Template ID of the contract. */
        templateId: z.string(),
        /** Contract ID to exercise the choice on. */
        contractId: z.string(),
        /** Name of the choice to exercise. */
        choice: z.string(),
        /** Arguments for the choice. */
        choiceArgument: RecordSchema,
      })
      .strict(),
  })
  .strict();

export const CommandSchema = z.union([CreateCommandSchema, ExerciseCommandSchema]);

export const DisclosedContractSchema = z
  .object({
    /** Template ID of the disclosed contract. */
    templateId: z.string(),
    /** Contract ID of the disclosed contract. */
    contractId: z.string(),
    /** Serialized event blob for the disclosed contract. */
    createdEventBlob: z.string(),
    /** Synchronizer ID for the disclosed contract. */
    synchronizerId: z.string(),
  })
  .strict();

export const CommandRequestSchema = z
  .object({
    /** List of commands to submit. */
    commands: z.array(CommandSchema),
    /** Unique identifier for the command request. */
    commandId: z.string(),
    /** Parties submitting the command. */
    actAs: z.array(z.string()),
    /** Parties to read as (optional). */
    readAs: z.array(z.string()).optional(),
    /** Disclosed contracts referenced by the command (optional). */
    disclosedContracts: z.array(DisclosedContractSchema).optional(),
  })
  .strict();

/** Command to create a contract and immediately exercise a choice on it. */
export const CreateAndExerciseCommandSchema = z
  .object({
    CreateAndExerciseCommand: z
      .object({
        /** Template ID of the contract to create. */
        templateId: z.string(),
        /** Arguments for the contract creation. */
        createArguments: RecordSchema,
        /** Name of the choice to exercise. */
        choice: z.string(),
        /** Arguments for the choice. */
        choiceArgument: RecordSchema,
      })
      .strict(),
  })
  .strict();

/** Command to exercise a choice on a contract by key. */
export const ExerciseByKeyCommandSchema = z
  .object({
    ExerciseByKeyCommand: z
      .object({
        /** Template ID of the contract. */
        templateId: z.string(),
        /** Contract key to exercise the choice on. */
        contractKey: RecordSchema,
        /** Name of the choice to exercise. */
        choice: z.string(),
        /** Arguments for the choice. */
        choiceArgument: RecordSchema,
      })
      .strict(),
  })
  .strict();

/** Command to assign a contract (reassignment). */
export const AssignCommandSchema = z
  .object({
    AssignCommand: z
      .object({
        /** Reassignment ID from the unassigned event. */
        reassignmentId: z.string(),
        /** Source synchronizer ID. */
        source: z.string(),
        /** Target synchronizer ID. */
        target: z.string(),
      })
      .strict(),
  })
  .strict();

/** Command to unassign a contract (reassignment). */
export const UnassignCommandSchema = z
  .object({
    UnassignCommand: z
      .object({
        /** Contract ID to unassign. */
        contractId: z.string(),
        /** Source synchronizer ID. */
        source: z.string(),
        /** Target synchronizer ID. */
        target: z.string(),
      })
      .strict(),
  })
  .strict();

/** Composite command type (oneOf all supported commands). */
export const CompositeCommandSchema = z.union([
  CreateAndExerciseCommandSchema,
  CreateCommandSchema,
  ExerciseByKeyCommandSchema,
  ExerciseCommandSchema,
  AssignCommandSchema,
  UnassignCommandSchema,
]);

/** Deduplication period (oneOf duration, offset, or empty). */
export const DeduplicationPeriodSchema = z.union([
  z.object({ DeduplicationDuration: DeduplicationDurationSchema }),
  z.object({ DeduplicationOffset: DeduplicationOffsetSchema }),
  z.object({ Empty: EmptyDeduplicationSchema }),
]);

/** Commands container with all command types. */
export const JsCommandsSchema = z.object({
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** User ID submitting the command. */
  userId: z.string(),
  /** Unique identifier for the command. */
  commandId: z.string(),
  /** Party submitting the command. */
  submitter: z.string(),
  /** Submission ID (optional). */
  submissionId: z.string().optional(),
  /** List of commands to execute. */
  commands: z.array(CommandSchema),
  /** Deduplication period (optional). */
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time relative to submission (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
});

// Export types
export type CreateCommand = z.infer<typeof CreateCommandSchema>;
export type ExerciseCommand = z.infer<typeof ExerciseCommandSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type DisclosedContract = z.infer<typeof DisclosedContractSchema>;
export type CommandRequest = z.infer<typeof CommandRequestSchema>;
export type CreateAndExerciseCommand = z.infer<typeof CreateAndExerciseCommandSchema>;
export type ExerciseByKeyCommand = z.infer<typeof ExerciseByKeyCommandSchema>;
export type AssignCommand = z.infer<typeof AssignCommandSchema>;
export type UnassignCommand = z.infer<typeof UnassignCommandSchema>;
export type CompositeCommand = z.infer<typeof CompositeCommandSchema>;
export type JsCommands = z.infer<typeof JsCommandsSchema>;
