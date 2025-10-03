import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

/** Parameters for listing known parties. */
export const ListKnownPartiesParamsSchema = z.object({
  /** Maximum number of elements in a returned page (optional). */
  pageSize: z.number().int().positive().optional(),
  /** Token to continue results from a given page (optional). */
  pageToken: z.string().optional(),
});

/** Parameters for allocating a new party. */
export const AllocatePartyParamsSchema = z.object({
  /** Party ID hint (optional). */
  partyIdHint: z.string().optional(),
  /** Local metadata (optional). */
  localMetadata: z
    .object({
      /** Resource version for concurrent change detection. */
      resourceVersion: z.string(),
      /** Annotations for the resource. */
      annotations: z.record(z.string(), z.string()),
    })
    .optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** User ID to grant rights to (optional). */
  userId: z.string().optional(),
});

/** Parameters for getting participant ID. */
export const GetParticipantIdParamsSchema = z.void();

/** Parameters for getting party details. */
export const GetPartyDetailsParamsSchema = z.object({
  /** Party identifier. */
  party: NonEmptyStringSchema,
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
  /** Additional parties to include (optional). */
  parties: z.array(z.string()).optional(),
});

/** Parameters for updating party details. */
export const UpdatePartyDetailsParamsSchema = z.object({
  /** Party identifier. */
  party: NonEmptyStringSchema,
  /** Party details to update. */
  partyDetails: z.object({
    /** Party identifier. */
    party: z.string(),
    /** Whether the party is local. */
    isLocal: z.boolean(),
    /** Local metadata (optional). */
    localMetadata: z
      .object({
        /** Resource version for concurrent change detection. */
        resourceVersion: z.string(),
        /** Annotations for the resource. */
        annotations: z.record(z.string(), z.string()),
      })
      .optional(),
    /** Identity provider ID (optional). */
    identityProviderId: z.string().optional(),
  }),
  /** Update mask for partial updates. */
  updateMask: z.object({
    /** Update paths. */
    paths: z.array(z.string()),
  }),
});

// Export types
export type ListKnownPartiesParams = z.infer<typeof ListKnownPartiesParamsSchema>;
export type AllocatePartyParams = z.infer<typeof AllocatePartyParamsSchema>;
export type GetParticipantIdParams = z.infer<typeof GetParticipantIdParamsSchema>;
export type GetPartyDetailsParams = z.infer<typeof GetPartyDetailsParamsSchema>;
export type UpdatePartyDetailsParams = z.infer<typeof UpdatePartyDetailsParamsSchema>;
