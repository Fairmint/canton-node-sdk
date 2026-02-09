import { z } from 'zod';
import { CompositeCommandSchema, DeduplicationPeriodSchema, DisclosedContractSchema } from '../api/commands';
import { ReassignmentCommandSchema } from '../api/reassignment';
import { MinLedgerTimeRelSchema, PrefetchContractKeySchema } from '../common';
import { NonEmptyStringSchema } from './base';
import { OperationEventFormatSchema, TransactionFormatSchema } from './updates';

/**
 * Shared fields for all command submission schemas. These are common across submit-and-wait, async submit, and
 * transaction tree variants.
 */
const BaseCommandParamsSchema = z.object({
  /** Commands to submit. */
  commands: z.array(CompositeCommandSchema),
  /** Unique identifier for the command (auto-generated if omitted). */
  commandId: NonEmptyStringSchema.optional(),
  /** Parties on whose behalf the command is executed (defaults to client's party ID). */
  actAs: z.array(NonEmptyStringSchema).optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Parties to read as. */
  readAs: z.array(NonEmptyStringSchema).optional(),
  /** Workflow ID for correlating commands. */
  workflowId: NonEmptyStringSchema.optional(),
  /** Deduplication period. */
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute. */
  minLedgerTimeAbs: NonEmptyStringSchema.optional(),
  /** Minimum ledger time relative. */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID. */
  submissionId: NonEmptyStringSchema.optional(),
  /** Disclosed contracts to include. */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Target synchronizer ID. */
  synchronizerId: NonEmptyStringSchema.optional(),
  /** Package ID selection preference. */
  packageIdSelectionPreference: z.array(NonEmptyStringSchema).optional(),
  /** Prefetch contract keys. */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
});

/** Shared fields for reassignment command submission schemas. */
const BaseReassignmentCommandSchema = z.object({
  /** Workflow ID for correlating commands. */
  workflowId: NonEmptyStringSchema.optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: NonEmptyStringSchema.optional(),
  /** Unique identifier for the command. */
  commandId: NonEmptyStringSchema,
  /** Party submitting the command. */
  submitter: NonEmptyStringSchema,
  /** Submission ID. */
  submissionId: NonEmptyStringSchema.optional(),
  /** Individual reassignment commands. */
  commands: z.array(ReassignmentCommandSchema),
});

export const SubmitAndWaitParamsSchema = BaseCommandParamsSchema;

export const SubmitAndWaitForTransactionParamsSchema = BaseCommandParamsSchema.extend({
  /** Transaction format. */
  transactionFormat: TransactionFormatSchema.optional(),
});

export const SubmitAndWaitForReassignmentParamsSchema = z.object({
  /** Reassignment commands to submit. */
  reassignmentCommands: BaseReassignmentCommandSchema,
  /** Event format. */
  eventFormat: OperationEventFormatSchema.optional(),
});

export const SubmitAndWaitForTransactionTreeParamsSchema = BaseCommandParamsSchema;

export const AsyncSubmitParamsSchema = BaseCommandParamsSchema;

export const AsyncSubmitReassignmentParamsSchema = z.object({
  /** Reassignment commands to submit asynchronously. */
  reassignmentCommands: BaseReassignmentCommandSchema,
});

export const CompletionsParamsSchema = z.object({
  /** User ID to filter completions for. */
  userId: NonEmptyStringSchema,
  /** Parties whose data should be included. */
  parties: z.array(NonEmptyStringSchema),
  /** Beginning offset for completions. */
  beginExclusive: z.number().int().min(0).optional(),
  /** Maximum number of elements to return. */
  limit: z.number().int().min(1).optional(),
  /** Timeout for stream completion in milliseconds. */
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
