import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

export const SubmitAndWaitParamsSchema = z.object({
  /** Commands to submit and wait for completion. */
  commands: z.array(z.any()),
  /** Unique identifier for the command (optional, will be auto-generated if not provided). */
  commandId: NonEmptyStringSchema.optional(),
  /** Parties on whose behalf the command should be executed (optional, will use client's party ID if not provided). */
  actAs: z.array(NonEmptyStringSchema).optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Parties to read as (optional). */
  readAs: z.array(NonEmptyStringSchema).optional(),
  /** Workflow ID (optional). */
  workflowId: NonEmptyStringSchema.optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(z.any()).optional(),
});

export const SubmitAndWaitForTransactionParamsSchema = z.object({
  /** Commands to submit and wait for transaction. */
  commands: z.array(z.any()),
  /** Unique identifier for the command (optional, will be auto-generated if not provided). */
  commandId: NonEmptyStringSchema.optional(),
  /** Parties on whose behalf the command should be executed (optional, will use client's party ID if not provided). */
  actAs: z.array(NonEmptyStringSchema).optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Parties to read as (optional). */
  readAs: z.array(NonEmptyStringSchema).optional(),
  /** Workflow ID (optional). */
  workflowId: NonEmptyStringSchema.optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(z.any()).optional(),
  /** Transaction format (optional). */
  transactionFormat: z.any().optional(),
});

export const SubmitAndWaitForReassignmentParamsSchema = z.object({
  /** Reassignment commands to submit. */
  reassignmentCommands: z.object({
    /** Workflow ID (optional). */
    workflowId: NonEmptyStringSchema.optional(),
    /** User ID submitting the command (optional if using authentication). */
    userId: NonEmptyStringSchema.optional(),
    /** Unique identifier for the command. */
    commandId: NonEmptyStringSchema,
    /** Party submitting the command. */
    submitter: NonEmptyStringSchema,
    /** Submission ID (optional). */
    submissionId: NonEmptyStringSchema.optional(),
    /** Individual reassignment commands. */
    commands: z.array(z.any()),
  }),
  /** Event format (optional). */
  eventFormat: z.any().optional(),
});

export const SubmitAndWaitForTransactionTreeParamsSchema = z.object({
  /** Commands to submit and wait for transaction tree. */
  commands: z.array(z.any()),
  /** Unique identifier for the command. */
  commandId: NonEmptyStringSchema,
  /** Parties on whose behalf the command should be executed. */
  actAs: z.array(NonEmptyStringSchema),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Parties to read as (optional). */
  readAs: z.array(NonEmptyStringSchema).optional(),
  /** Workflow ID (optional). */
  workflowId: NonEmptyStringSchema.optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(z.any()).optional(),
});

export const AsyncSubmitParamsSchema = z.object({
  /** Commands to submit asynchronously. */
  commands: z.array(z.any()),
  /** Unique identifier for the command (optional, will be auto-generated if not provided). */
  commandId: NonEmptyStringSchema.optional(),
  /** Parties on whose behalf the command should be executed (optional, will use client's party ID if not provided). */
  actAs: z.array(NonEmptyStringSchema).optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Parties to read as (optional). */
  readAs: z.array(NonEmptyStringSchema).optional(),
  /** Workflow ID (optional). */
  workflowId: NonEmptyStringSchema.optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(z.any()).optional(),
});

export const AsyncSubmitReassignmentParamsSchema = z.object({
  /** Reassignment commands to submit asynchronously. */
  reassignmentCommands: z.object({
    /** Workflow ID (optional). */
    workflowId: NonEmptyStringSchema.optional(),
    /** User ID submitting the command (optional if using authentication). */
    userId: NonEmptyStringSchema.optional(),
    /** Unique identifier for the command. */
    commandId: NonEmptyStringSchema,
    /** Party submitting the command. */
    submitter: NonEmptyStringSchema,
    /** Submission ID (optional). */
    submissionId: NonEmptyStringSchema.optional(),
    /** Individual reassignment commands. */
    commands: z.array(z.any()),
  }),
});

export const CompletionsParamsSchema = z.object({
  /** User ID to filter completions for. */
  userId: NonEmptyStringSchema,
  /** Parties whose data should be included. */
  parties: z.array(NonEmptyStringSchema),
  /** Beginning offset for completions (optional). */
  beginExclusive: z.number().int().min(0).optional(),
  /** Maximum number of elements to return (optional). */
  limit: z.number().int().min(1).optional(),
  /** Timeout for stream completion (optional). */
  streamIdleTimeoutMs: z.number().int().min(1).optional(),
});

// Export types
export type SubmitAndWaitParams = z.infer<typeof SubmitAndWaitParamsSchema>;
export type SubmitAndWaitForTransactionParams = z.infer<typeof SubmitAndWaitForTransactionParamsSchema>;
export type SubmitAndWaitForReassignmentParams = z.infer<typeof SubmitAndWaitForReassignmentParamsSchema>;
export type SubmitAndWaitForTransactionTreeParams = z.infer<typeof SubmitAndWaitForTransactionTreeParamsSchema>;
export type AsyncSubmitParams = z.infer<typeof AsyncSubmitParamsSchema>;
export type AsyncSubmitReassignmentParams = z.infer<typeof AsyncSubmitReassignmentParamsSchema>;
export type CompletionsParams = z.infer<typeof CompletionsParamsSchema>;
