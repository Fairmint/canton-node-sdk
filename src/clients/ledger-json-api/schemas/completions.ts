import { z } from 'zod';
import { StatusDetailsSchema } from './event-details';
import { DeduplicationPeriodSchema } from './commands';
import { TraceContextSchema } from './common';

/**
 * Status information for completions.
 */
export const JsStatusSchema = z.object({
  /** Status code. */
  code: z.number(),
  /** Status message. */
  message: z.string(),
  /** Additional details (optional). */
  details: z.array(StatusDetailsSchema).optional(),
});

/**
 * Synchronizer time information.
 */
export const SynchronizerTimeSchema = z.object({
  /** Synchronizer ID. */
  synchronizerId: z.string(),
  /** Record time. */
  recordTime: z.string(),
});

/**
 * Completion details.
 */
export const CompletionSchema = z.object({
  /** The completion details. */
  value: z.object({
    /** Command ID of the succeeded or failed command. */
    commandId: z.string(),
    /** Status information (optional). */
    status: JsStatusSchema.optional(),
    /** Update ID of the transaction (optional). */
    updateId: z.string().optional(),
    /** User ID that was used for the submission (optional). */
    userId: z.string().optional(),
    /** Parties on whose behalf the commands were executed (optional). */
    actAs: z.array(z.string()).optional(),
    /** Submission ID (optional). */
    submissionId: z.string().optional(),
    /** Deduplication period. */
    deduplicationPeriod: DeduplicationPeriodSchema,
    /** Trace context (optional). */
    traceContext: TraceContextSchema.optional(),
    /** Offset for resuming the stream. */
    offset: z.number(),
    /** Synchronizer time information. */
    synchronizerTime: SynchronizerTimeSchema,
  }),
});

/**
 * Offset checkpoint for stream resumption.
 */
export const OffsetCheckpointSchema = z.object({
  /** The checkpoint details. */
  value: z.object({
    /** Offset for resuming the stream. */
    offset: z.number(),
    /** Synchronizer times. */
    synchronizerTimes: z.array(SynchronizerTimeSchema),
  }),
});

/**
 * Completion response (oneOf completion, empty, or offset checkpoint).
 */
export const CompletionResponseSchema = z.union([
  z.object({ Completion: CompletionSchema }),
  z.object({ Empty: z.object({}) }),
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
]);

/**
 * Completion stream request.
 */
export const CompletionStreamRequestSchema = z.object({
  /** User ID for the stream (optional if using authentication). */
  userId: z.string().optional(),
  /** Parties whose data should be included. */
  parties: z.array(z.string()),
  /** Beginning offset (exclusive) for resuming the stream. */
  beginExclusive: z.number().optional(),
});

/**
 * Completion stream response.
 */
export const CompletionStreamResponseSchema = z.object({
  /** The completion response. */
  completionResponse: CompletionResponseSchema,
});

// Export types
export type JsStatus = z.infer<typeof JsStatusSchema>;
export type DeduplicationPeriod = z.infer<typeof DeduplicationPeriodSchema>;
export type SynchronizerTime = z.infer<typeof SynchronizerTimeSchema>;
export type Completion = z.infer<typeof CompletionSchema>;
export type OffsetCheckpoint = z.infer<typeof OffsetCheckpointSchema>;
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;
export type CompletionStreamRequest = z.infer<typeof CompletionStreamRequestSchema>;
export type CompletionStreamResponse = z.infer<typeof CompletionStreamResponseSchema>; 