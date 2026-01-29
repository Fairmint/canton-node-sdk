import { z } from 'zod';
import { CompositeCommandSchema, DeduplicationPeriodSchema, DisclosedContractSchema } from '../api/commands';
import { ReassignmentCommandSchema } from '../api/reassignment';
import { MinLedgerTimeRelSchema, PrefetchContractKeySchema } from '../common';
import { NonEmptyStringSchema } from './base';
import { OperationEventFormatSchema, TransactionFormatSchema } from './updates';

export const SubmitAndWaitParamsSchema = z.object({
  /** Commands to submit and wait for completion. */
  commands: z.array(CompositeCommandSchema),
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
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
});

export const SubmitAndWaitForTransactionParamsSchema = z.object({
  /** Commands to submit and wait for transaction. */
  commands: z.array(CompositeCommandSchema),
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
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
  /** Transaction format (optional). */
  transactionFormat: TransactionFormatSchema.optional(),
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
    commands: z.array(ReassignmentCommandSchema),
  }),
  /** Event format (optional). */
  eventFormat: OperationEventFormatSchema.optional(),
});

export const SubmitAndWaitForTransactionTreeParamsSchema = z.object({
  /** Commands to submit and wait for transaction tree. */
  commands: z.array(CompositeCommandSchema),
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
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
});

export const AsyncSubmitParamsSchema = z.object({
  /** Commands to submit asynchronously. */
  commands: z.array(CompositeCommandSchema),
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
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID (optional). */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
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
    commands: z.array(ReassignmentCommandSchema),
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
