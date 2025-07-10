import { z } from 'zod';

/**
 * Trace context for distributed tracing.
 */
export const TraceContextSchema = z.object({
  /** Trace ID for the request. */
  traceId: z.string().optional(),
  /** Span ID for the current operation. */
  spanId: z.string().optional(),
  /** Parent span ID (optional). */
  parentSpanId: z.string().optional(),
  /** Additional trace metadata. */
  metadata: z.record(z.string()).optional(),
});

/**
 * Filter for active contracts and events.
 */
export const FilterSchema = z.object({
  /** Template or interface filters. */
  filtersByParty: z.record(
    z.object({
      /** List of template or interface filters for this party. */
      cumulative: z.array(z.string()),
    }).strict()
  ).optional(),
  /** If true, include all available fields. */
  verbose: z.boolean().optional(),
});

/**
 * Deduplication duration.
 */
export const DeduplicationDurationSchema = z.object({
  /** Duration in seconds. */
  seconds: z.number(),
});

/**
 * Deduplication offset.
 */
export const DeduplicationOffsetSchema = z.object({
  /** Offset value. */
  offset: z.number(),
});

/**
 * Empty deduplication period.
 */
export const EmptyDeduplicationSchema = z.object({});

/**
 * Minimum ledger time relative to submission.
 */
export const MinLedgerTimeRelSchema = z.object({
  /** Relative time in seconds. */
  seconds: z.number(),
});

/**
 * Contract key for prefetching.
 */
export const PrefetchContractKeySchema = z.object({
  /** Template ID. */
  templateId: z.string(),
  /** Contract key. */
  contractKey: z.record(z.any()),
});

/**
 * Update mask for partial updates.
 */
export const UpdateMaskSchema = z.object({
  /** List of field paths to update. */
  paths: z.array(z.string()),
});

/**
 * API features supported by the endpoint.
 */
export const ApiFeaturesSchema = z.object({
  /** List of supported features. */
  features: z.array(z.string()),
  /** Feature metadata. */
  metadata: z.record(z.any()).optional(),
});

// Export types
export type TraceContext = z.infer<typeof TraceContextSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type DeduplicationDuration = z.infer<typeof DeduplicationDurationSchema>;
export type DeduplicationOffset = z.infer<typeof DeduplicationOffsetSchema>;
export type EmptyDeduplication = z.infer<typeof EmptyDeduplicationSchema>;
export type MinLedgerTimeRel = z.infer<typeof MinLedgerTimeRelSchema>;
export type PrefetchContractKey = z.infer<typeof PrefetchContractKeySchema>;
export type UpdateMask = z.infer<typeof UpdateMaskSchema>;
export type ApiFeatures = z.infer<typeof ApiFeaturesSchema>; 