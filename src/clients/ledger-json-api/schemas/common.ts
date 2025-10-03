import { z } from 'zod';

/** Trace context for distributed tracing. */
export const TraceContextSchema = z.object({
  /** Trace ID for the request. */
  traceId: z.string().optional(),
  /** Span ID for the current operation. */
  spanId: z.string().optional(),
  /** Parent span ID (optional). */
  parentSpanId: z.string().optional(),
  /** Additional trace metadata. */
  metadata: z.record(z.string(), z.string()).optional(),
});

/** Filter for active contracts and events. */
export const FilterSchema = z.object({
  /** Template or interface filters. */
  filtersByParty: z
    .record(
      z.string(),
      z
        .object({
          /** List of template or interface filters for this party. */
          cumulative: z.array(z.string()),
        })
        .strict()
    )
    .optional(),
  /** If true, include all available fields. */
  verbose: z.boolean().optional(),
});

/** Deduplication duration. */
export const DeduplicationDurationSchema = z.object({
  /** Duration in seconds. */
  seconds: z.number(),
});

/** Deduplication offset. */
export const DeduplicationOffsetSchema = z.object({
  /** Offset value. */
  offset: z.number(),
});

/** Empty deduplication period. */
export const EmptyDeduplicationSchema = z.object({});

/** Minimum ledger time relative to submission. */
export const MinLedgerTimeRelSchema = z.object({
  /** Relative time in seconds. */
  seconds: z.number(),
});

/** Contract key for prefetching. */
export const PrefetchContractKeySchema = z.object({
  /** Template ID. */
  templateId: z.string(),
  /** Contract key. */
  contractKey: z.record(z.string(), z.any()),
});

/** Update mask for partial updates. */
export const UpdateMaskSchema = z.object({
  /** List of field paths to update. */
  paths: z.array(z.string()),
});

/** Experimental features configuration. */
export const ExperimentalFeaturesSchema = z.object({
  /** Static time support. */
  staticTime: z.object({
    /** Whether static time is supported. */
    supported: z.boolean(),
  }),
  /** Command inspection service support. */
  commandInspectionService: z.object({
    /** Whether command inspection service is supported. */
    supported: z.boolean(),
  }),
});

/** User management features configuration. */
export const UserManagementFeaturesSchema = z.object({
  /** Whether user management is supported. */
  supported: z.boolean(),
  /** Maximum rights per user. */
  maxRightsPerUser: z.number(),
  /** Maximum users page size. */
  maxUsersPageSize: z.number(),
});

/** Party management features configuration. */
export const PartyManagementFeaturesSchema = z.object({
  /** Maximum parties page size. */
  maxPartiesPageSize: z.number(),
});

/** Duration with seconds and nanoseconds. */
export const DurationSchema = z.object({
  /** Duration in seconds. */
  seconds: z.number(),
  /** Duration in nanoseconds. */
  nanos: z.number(),
  /** Unknown fields. */
  unknownFields: z.object({
    /** Fields object. */
    fields: z.record(z.string(), z.any()),
  }),
});

/** Offset checkpoint features configuration. */
export const OffsetCheckpointFeaturesSchema = z.object({
  /** Maximum offset checkpoint emission delay. */
  maxOffsetCheckpointEmissionDelay: DurationSchema,
});

/** API features supported by the endpoint. */
export const ApiFeaturesSchema = z.object({
  /** Experimental features. */
  experimental: ExperimentalFeaturesSchema,
  /** User management features. */
  userManagement: UserManagementFeaturesSchema,
  /** Party management features. */
  partyManagement: PartyManagementFeaturesSchema,
  /** Offset checkpoint features. */
  offsetCheckpoint: OffsetCheckpointFeaturesSchema,
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
export type ExperimentalFeatures = z.infer<typeof ExperimentalFeaturesSchema>;
export type UserManagementFeatures = z.infer<typeof UserManagementFeaturesSchema>;
export type PartyManagementFeatures = z.infer<typeof PartyManagementFeaturesSchema>;
export type Duration = z.infer<typeof DurationSchema>;
export type OffsetCheckpointFeatures = z.infer<typeof OffsetCheckpointFeaturesSchema>;
export type ApiFeatures = z.infer<typeof ApiFeaturesSchema>;
