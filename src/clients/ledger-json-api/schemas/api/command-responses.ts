import { z } from 'zod';

/**
 * Submit response for async command submission.
 */
export const SubmitResponseSchema = z.object({
  // Empty object as per OpenAPI spec
}).strict();

/**
 * Submit and wait for transaction tree response.
 */
export const JsSubmitAndWaitForTransactionTreeResponseSchema = z.object({
  /** The transaction tree that resulted from the submitted command. */
  transactionTree: z.object({
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
    eventsById: z.record(z.any()),
    /** Record time of the transaction. */
    recordTime: z.string(),
  }),
});

// Export types
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;
export type JsSubmitAndWaitForTransactionTreeResponse = z.infer<typeof JsSubmitAndWaitForTransactionTreeResponseSchema>; 