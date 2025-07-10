import { z } from 'zod';
import { TreeEventSchema } from './events';

export const TransactionTreeSchema = z
  .object({
    /** Unique update ID for the transaction. */
    updateId: z.string(),
    /** Command ID associated with the transaction (optional). */
    commandId: z.string().optional(),
    /** Workflow ID associated with the transaction (optional). */
    workflowId: z.string().optional(),
    /** Effective time of the transaction (ISO 8601). */
    effectiveAt: z.string(),
    /** Offset of the transaction in the ledger stream. */
    offset: z.number(),
    /** Map of event node IDs to tree events. */
    eventsById: z.record(TreeEventSchema),
    /** Record time of the transaction (ISO 8601). */
    recordTime: z.string(),
    /** Synchronizer ID for the transaction. */
    synchronizerId: z.string(),
    /** Trace context for distributed tracing (optional). */
    traceContext: z.object({
      /** W3C traceparent header value. */
      traceparent: z.string(),
      /** W3C tracestate header value (nullable). */
      tracestate: z.string().nullable(),
    }).optional(),
  })
  .strict();

export const CommandResponseSchema = z
  .object({
    /** Transaction tree returned in response to a command. */
    transactionTree: TransactionTreeSchema,
  })
  .strict();

export const CreateContractResponseSchema = z
  .object({
    /** Contract ID of the newly created contract. */
    contractId: z.string(),
    /** Update ID of the transaction that created the contract. */
    updateId: z.string(),
  })
  .strict();

export const UpdateByIdRequestSchema = z
  .object({
    /** Update ID to fetch. */
    updateId: z.string(),
    /** Parties requesting the update. */
    requestingParties: z.array(z.string()),
    /** Format of the update. */
    updateFormat: z.string(),
    /** Whether to include transactions in the response. */
    includeTransactions: z.boolean(),
  })
  .strict();

export const UpdateByIdResponseSchema = z
  .object({
    /** Transaction tree for the requested update. */
    update: TransactionTreeSchema,
  })
  .strict();

export const TransactionTreeByOffsetResponseSchema = z
  .object({
    /** Transaction tree for the requested offset. */
    transaction: TransactionTreeSchema,
  })
  .strict();

export type TransactionTree = z.infer<typeof TransactionTreeSchema>;
export type CommandResponse = z.infer<typeof CommandResponseSchema>;
export type CreateContractResponse = z.infer<
  typeof CreateContractResponseSchema
>;
export type UpdateByIdRequest = z.infer<typeof UpdateByIdRequestSchema>;
export type UpdateByIdResponse = z.infer<typeof UpdateByIdResponseSchema>;
export type TransactionTreeByOffsetResponse = z.infer<
  typeof TransactionTreeByOffsetResponseSchema
>; 