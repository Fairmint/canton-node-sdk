import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

/**
 * Parameters for interactive submission allocate party.
 */
export const InteractiveSubmissionAllocatePartyParamsSchema = z.object({
  /** Party identifier hint (optional). */
  partyIdHint: z.string().optional(),
  /** Display name (optional). */
  displayName: z.string().optional(),
  /** Is local party flag (optional). */
  isLocal: z.boolean().optional(),
});

/**
 * Parameters for interactive submission create user.
 */
export const InteractiveSubmissionCreateUserParamsSchema = z.object({
  /** User to create. */
  user: z.object({
    /** User identifier. */
    id: NonEmptyStringSchema,
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z.object({
      /** Resource version for concurrent change detection. */
      resourceVersion: z.string(),
      /** Annotations for the resource. */
      annotations: z.record(z.string()),
    }).optional(),
    /** Identity provider ID (optional). */
    identityProviderId: z.string().optional(),
  }),
  /** Rights to assign to the user (optional). */
  rights: z.array(z.object({
    /** The kind of right. */
    kind: z.union([
      z.object({ CanActAs: z.object({ party: z.string() }) }),
      z.object({ CanReadAs: z.object({ party: z.string() }) }),
      z.object({ CanReadAsAnyParty: z.object({}) }),
      z.object({ Empty: z.object({}) }),
      z.object({ IdentityProviderAdmin: z.object({}) }),
      z.object({ ParticipantAdmin: z.object({}) }),
    ]),
  })).optional(),
});

/**
 * Parameters for interactive submission upload DAR.
 */
export const InteractiveSubmissionUploadDarParamsSchema = z.object({
  /** DAR file content as a buffer or string. */
  darFile: z.any(), // Buffer or string
});

// Export types
export type InteractiveSubmissionAllocatePartyParams = z.infer<typeof InteractiveSubmissionAllocatePartyParamsSchema>;
export type InteractiveSubmissionCreateUserParams = z.infer<typeof InteractiveSubmissionCreateUserParamsSchema>;
export type InteractiveSubmissionUploadDarParams = z.infer<typeof InteractiveSubmissionUploadDarParamsSchema>; 