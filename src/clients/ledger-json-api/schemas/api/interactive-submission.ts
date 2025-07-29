import { z } from 'zod';

/**
 * Interactive submission allocate party request.
 */
export const InteractiveSubmissionAllocatePartyRequestSchema = z.object({
  /** Party identifier hint (optional). */
  partyIdHint: z.string().optional(),
  /** Display name (optional). */
  displayName: z.string().optional(),
  /** Is local party flag (optional). */
  isLocal: z.boolean().optional(),
});

/**
 * Interactive submission allocate party response.
 */
export const InteractiveSubmissionAllocatePartyResponseSchema = z.object({
  /** Allocated party details. */
  party: z.object({
    /** Party identifier. */
    party: z.string(),
    /** Display name (optional). */
    displayName: z.string().optional(),
    /** Is local party flag. */
    isLocal: z.boolean(),
  }),
});

/**
 * Interactive submission create user request.
 */
export const InteractiveSubmissionCreateUserRequestSchema = z.object({
  /** User to create. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z.object({
      /** Resource version for concurrent change detection. */
      resourceVersion: z.string(),
      /** Annotations for the resource. */
      annotations: z.record(z.string(), z.string()),
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
 * Interactive submission create user response.
 */
export const InteractiveSubmissionCreateUserResponseSchema = z.object({
  /** Created user. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z.object({
      /** Resource version for concurrent change detection. */
      resourceVersion: z.string(),
      /** Annotations for the resource. */
      annotations: z.record(z.string(), z.string()),
    }).optional(),
    /** Identity provider ID (optional). */
    identityProviderId: z.string().optional(),
  }),
});

/**
 * Interactive submission upload DAR request.
 */
export const InteractiveSubmissionUploadDarRequestSchema = z.object({
  /** DAR file content. */
  darFile: z.any(), // Buffer or string
});

/**
 * Interactive submission upload DAR response.
 */
export const InteractiveSubmissionUploadDarResponseSchema = z.object({});

// Export types
export type InteractiveSubmissionAllocatePartyRequest = z.infer<typeof InteractiveSubmissionAllocatePartyRequestSchema>;
export type InteractiveSubmissionAllocatePartyResponse = z.infer<typeof InteractiveSubmissionAllocatePartyResponseSchema>;
export type InteractiveSubmissionCreateUserRequest = z.infer<typeof InteractiveSubmissionCreateUserRequestSchema>;
export type InteractiveSubmissionCreateUserResponse = z.infer<typeof InteractiveSubmissionCreateUserResponseSchema>;
export type InteractiveSubmissionUploadDarRequest = z.infer<typeof InteractiveSubmissionUploadDarRequestSchema>;
export type InteractiveSubmissionUploadDarResponse = z.infer<typeof InteractiveSubmissionUploadDarResponseSchema>; 