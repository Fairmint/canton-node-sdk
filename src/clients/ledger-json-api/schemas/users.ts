import { z } from 'zod';
import { UpdateMaskSchema } from './common';

/**
 * Object metadata for resources.
 */
export const ObjectMetaSchema = z.object({
  /** Resource version for concurrent change detection. */
  resourceVersion: z.string(),
  /** Annotations for the resource. */
  annotations: z.record(z.string()),
});

/**
 * User rights types.
 */
export const CanActAsSchema = z.object({
  /** The party the user can act as. */
  party: z.string(),
});

export const CanReadAsSchema = z.object({
  /** The party the user can read as. */
  party: z.string(),
});

export const CanReadAsAnyPartySchema = z.object({});

export const IdentityProviderAdminSchema = z.object({});

export const ParticipantAdminSchema = z.object({});

/**
 * User right kind (oneOf all right types).
 */
export const RightKindSchema = z.union([
  z.object({ CanActAs: CanActAsSchema }),
  z.object({ CanReadAs: CanReadAsSchema }),
  z.object({ CanReadAsAnyParty: CanReadAsAnyPartySchema }),
  z.object({ Empty: z.object({}) }),
  z.object({ IdentityProviderAdmin: IdentityProviderAdminSchema }),
  z.object({ ParticipantAdmin: ParticipantAdminSchema }),
]);

/**
 * User right.
 */
export const RightSchema = z.object({
  /** The kind of right. */
  kind: RightKindSchema,
});

/**
 * User details.
 */
export const UserSchema = z.object({
  /** User identifier. */
  id: z.string(),
  /** Primary party for the user (optional). */
  primaryParty: z.string().optional(),
  /** Whether the user is deactivated. */
  isDeactivated: z.boolean(),
  /** User metadata (optional). */
  metadata: ObjectMetaSchema.optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
});

/**
 * Party details.
 */
export const PartyDetailsSchema = z.object({
  /** Party identifier. */
  party: z.string(),
  /** Whether the party is local. */
  isLocal: z.boolean(),
  /** Local metadata (optional). */
  localMetadata: ObjectMetaSchema.optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
});

/**
 * Create user request.
 */
export const CreateUserRequestSchema = z.object({
  /** The user to create. */
  user: UserSchema,
  /** Rights to assign to the user (optional). */
  rights: z.array(RightSchema).optional(),
});

/**
 * Create user response.
 */
export const CreateUserResponseSchema = z.object({
  /** Created user. */
  user: UserSchema,
});

/**
 * Update user request.
 */
export const UpdateUserRequestSchema = z.object({
  /** The user to update. */
  user: UserSchema,
  /** Update mask for partial updates. */
  updateMask: UpdateMaskSchema,
});

/**
 * Update user response.
 */
export const UpdateUserResponseSchema = z.object({
  /** Updated user. */
  user: UserSchema,
});

/**
 * Get user response.
 */
export const GetUserResponseSchema = z.object({
  /** Retrieved user. */
  user: UserSchema,
});

/**
 * List users response.
 */
export const ListUsersResponseSchema = z.object({
  /** List of users. */
  users: z.array(UserSchema),
  /** Pagination token. */
  nextPageToken: z.string(),
});

/**
 * List user rights response.
 */
export const ListUserRightsResponseSchema = z.object({
  /** All rights of the user. */
  rights: z.array(RightSchema),
});

/**
 * Grant user rights request.
 */
export const GrantUserRightsRequestSchema = z.object({
  /** User ID to grant rights to. */
  userId: z.string(),
  /** Rights to grant (optional). */
  rights: z.array(RightSchema).optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
});

/**
 * Grant user rights response.
 */
export const GrantUserRightsResponseSchema = z.object({
  /** Rights that were newly granted. */
  newlyGrantedRights: z.array(RightSchema),
});

/**
 * Revoke user rights request.
 */
export const RevokeUserRightsRequestSchema = z.object({
  /** User ID to revoke rights from. */
  userId: z.string(),
  /** Rights to revoke (optional). */
  rights: z.array(RightSchema).optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
});

/**
 * Revoke user rights response.
 */
export const RevokeUserRightsResponseSchema = z.object({
  /** Rights that were actually revoked. */
  newlyRevokedRights: z.array(RightSchema),
});

/**
 * Update user identity provider request.
 */
export const UpdateUserIdentityProviderIdRequestSchema = z.object({
  /** User ID to update. */
  userId: z.string(),
  /** Current identity provider ID. */
  sourceIdentityProviderId: z.string(),
  /** Target identity provider ID. */
  targetIdentityProviderId: z.string(),
});

/**
 * Update user identity provider response.
 */
export const UpdateUserIdentityProviderIdResponseSchema = z.object({});

/**
 * Allocate party request.
 */
export const AllocatePartyRequestSchema = z.object({
  /** Party ID hint (optional). */
  partyIdHint: z.string().optional(),
  /** Local metadata (optional). */
  localMetadata: ObjectMetaSchema.optional(),
  /** Identity provider ID (optional). */
  identityProviderId: z.string().optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** User ID to grant rights to (optional). */
  userId: z.string().optional(),
});

/**
 * Allocate party response.
 */
export const AllocatePartyResponseSchema = z.object({
  /** Party details. */
  partyDetails: PartyDetailsSchema,
});

/**
 * Update party details request.
 */
export const UpdatePartyDetailsRequestSchema = z.object({
  /** Party details to update. */
  partyDetails: PartyDetailsSchema,
  /** Update mask for partial updates. */
  updateMask: UpdateMaskSchema,
});

/**
 * Update party details response.
 */
export const UpdatePartyDetailsResponseSchema = z.object({
  /** Updated party details. */
  partyDetails: PartyDetailsSchema,
});

/**
 * List known parties response.
 */
export const ListKnownPartiesResponseSchema = z.object({
  /** List of party details. */
  partyDetails: z.array(PartyDetailsSchema),
  /** Pagination token. */
  nextPageToken: z.string(),
});

/**
 * Get parties response.
 */
export const GetPartiesResponseSchema = z.object({
  /** Party details. */
  partyDetails: z.array(PartyDetailsSchema),
});

/**
 * Get participant ID response.
 */
export const GetParticipantIdResponseSchema = z.object({
  /** Participant identifier. */
  participantId: z.string(),
});

// Export types
export type ObjectMeta = z.infer<typeof ObjectMetaSchema>;
export type CanActAs = z.infer<typeof CanActAsSchema>;
export type CanReadAs = z.infer<typeof CanReadAsSchema>;
export type CanReadAsAnyParty = z.infer<typeof CanReadAsAnyPartySchema>;
export type IdentityProviderAdmin = z.infer<typeof IdentityProviderAdminSchema>;
export type ParticipantAdmin = z.infer<typeof ParticipantAdminSchema>;
export type RightKind = z.infer<typeof RightKindSchema>;
export type Right = z.infer<typeof RightSchema>;
export type User = z.infer<typeof UserSchema>;
export type PartyDetails = z.infer<typeof PartyDetailsSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>;
export type GetUserResponse = z.infer<typeof GetUserResponseSchema>;
export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;
export type ListUserRightsResponse = z.infer<typeof ListUserRightsResponseSchema>;
export type GrantUserRightsRequest = z.infer<typeof GrantUserRightsRequestSchema>;
export type GrantUserRightsResponse = z.infer<typeof GrantUserRightsResponseSchema>;
export type RevokeUserRightsRequest = z.infer<typeof RevokeUserRightsRequestSchema>;
export type RevokeUserRightsResponse = z.infer<typeof RevokeUserRightsResponseSchema>;
export type UpdateUserIdentityProviderIdRequest = z.infer<typeof UpdateUserIdentityProviderIdRequestSchema>;
export type UpdateUserIdentityProviderIdResponse = z.infer<typeof UpdateUserIdentityProviderIdResponseSchema>;
export type AllocatePartyRequest = z.infer<typeof AllocatePartyRequestSchema>;
export type AllocatePartyResponse = z.infer<typeof AllocatePartyResponseSchema>;
export type UpdatePartyDetailsRequest = z.infer<typeof UpdatePartyDetailsRequestSchema>;
export type UpdatePartyDetailsResponse = z.infer<typeof UpdatePartyDetailsResponseSchema>;
export type ListKnownPartiesResponse = z.infer<typeof ListKnownPartiesResponseSchema>;
export type GetPartiesResponse = z.infer<typeof GetPartiesResponseSchema>;
export type GetParticipantIdResponse = z.infer<typeof GetParticipantIdResponseSchema>; 