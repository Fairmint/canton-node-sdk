import { z } from 'zod';
import { TraceContextSchema } from '../common';
import { DeduplicationPeriodSchema } from './commands';
import { StatusDetailsSchema } from './event-details';

/** Status information for completions. */
export const JsStatusSchema = z.object({
  /** Status code. */
  code: z.number(),
  /** Status message. */
  message: z.string(),
  /** Additional details (optional). */
  details: z.array(StatusDetailsSchema).optional(),
});

/** Synchronizer time information. */
export const SynchronizerTimeSchema = z.object({
  /** Synchronizer ID. */
  synchronizerId: z.string(),
  /** Record time. */
  recordTime: z.string(),
});

/** Completion details. */
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
    /** Deduplication period (optional; WS may use multiple shapes). */
    deduplicationPeriod: z
      .union([
        // Standard REST/JS shapes
        DeduplicationPeriodSchema,
        // WS variants with nested value wrappers or primitives
        z.object({ DeduplicationOffset: z.object({ value: z.object({ offset: z.number() }) }) }),
        z.object({ DeduplicationOffset: z.object({ value: z.number() }) }),
        z.object({ DeduplicationOffset: z.object({ offset: z.number() }) }),
        z.object({ DeduplicationOffset: z.number() }),
        z.object({ DeduplicationOffset: z.string() }),
        z.object({ DeduplicationDuration: z.object({ value: z.object({ seconds: z.number() }) }) }),
        z.object({ DeduplicationDuration: z.object({ value: z.number() }) }),
        z.object({ DeduplicationDuration: z.object({ seconds: z.number() }) }),
        z.object({ DeduplicationDuration: z.number() }),
        z.object({ DeduplicationDuration: z.string() }),
        // Sometimes an explicit Empty or empty object
        z.object({ Empty: z.object({}).strict() }),
        z.object({}).strict(),
      ])
      .optional()
      .nullable(),
    /** Trace context (optional). */
    traceContext: TraceContextSchema.optional(),
    /** Offset for resuming the stream. */
    offset: z.number(),
    /** Synchronizer time information. */
    synchronizerTime: SynchronizerTimeSchema,
  }),
});

/** Offset checkpoint for stream resumption. */
export const OffsetCheckpointSchema = z.object({
  /** The checkpoint details. */
  value: z.object({
    /** Offset for resuming the stream. */
    offset: z.number(),
    /** Synchronizer times. */
    synchronizerTimes: z.array(SynchronizerTimeSchema),
  }),
});

/** Completion response (oneOf completion, empty, or offset checkpoint). */
export const CompletionResponseSchema = z.union([
  z.object({ Completion: CompletionSchema }),
  z.object({ Empty: z.object({}) }),
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
]);

/** Completion stream request. */
export const CompletionStreamRequestSchema = z.object({
  /** User ID for the stream (optional if using authentication). */
  userId: z.string().optional(),
  /** Parties whose data should be included. */
  parties: z.array(z.string()),
  /** Beginning offset (exclusive) for resuming the stream. */
  beginExclusive: z.number().optional(),
});

/** Completion stream response. */
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
