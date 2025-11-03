import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

/** Schema for list users parameters. */
export const ListUsersParamsSchema = z.object({
  /** Maximum number of elements in a returned page. */
  pageSize: z.number().int().positive().optional(),
  /** Token to continue results from a given page. */
  pageToken: z.string().optional(),
});

/** Schema for create user parameters. */
export const CreateUserParamsSchema = z.object({
  /** The user to create. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z
      .object({
        /** Resource version for concurrent change detection. */
        resourceVersion: z.string(),
        /** Annotations for the resource. */
        annotations: z.record(z.string(), z.string()),
      })
      .optional(),
  }),
  /** Rights to assign to the user (optional). */
  rights: z
    .array(
      z.object({
        /** The kind of right. */
        kind: z.union([
          z.object({ CanActAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAsAnyParty: z.object({}) }),
          z.object({ Empty: z.object({}) }),
          z.object({ IdentityProviderAdmin: z.object({}) }),
          z.object({ ParticipantAdmin: z.object({}) }),
        ]),
      })
    )
    .optional(),
});

/** Schema for get user parameters. */
export const GetUserParamsSchema = z.object({
  /** User ID to get details for. */
  userId: NonEmptyStringSchema,
});

/** Schema for delete user parameters. */
export const DeleteUserParamsSchema = z.object({
  /** User ID to delete. */
  userId: NonEmptyStringSchema,
});

/** Schema for update user parameters. */
export const UpdateUserParamsSchema = z.object({
  /** User ID to update. */
  userId: NonEmptyStringSchema,
  /** The user to update. */
  user: z.object({
    /** User identifier. */
    id: z.string(),
    /** Primary party for the user (optional). */
    primaryParty: z.string().optional(),
    /** Whether the user is deactivated. */
    isDeactivated: z.boolean(),
    /** User metadata (optional). */
    metadata: z
      .object({
        /** Resource version for concurrent change detection. */
        resourceVersion: z.string(),
        /** Annotations for the resource. */
        annotations: z.record(z.string(), z.string()),
      })
      .optional(),
  }),
  /** Update mask for partial updates. */
  updateMask: z.object({
    /** Update paths. */
    paths: z.array(z.string()),
  }),
});

/** Schema for list user rights parameters. */
export const ListUserRightsParamsSchema = z.object({
  /** User ID to list rights for. */
  userId: NonEmptyStringSchema,
});

/** Schema for grant user rights parameters. */
export const GrantUserRightsParamsSchema = z.object({
  /** User ID to grant rights to. */
  userId: NonEmptyStringSchema,
  /** Rights to grant (optional). */
  rights: z
    .array(
      z.object({
        /** The kind of right. */
        kind: z.union([
          z.object({ CanActAs: z.object({ value: z.object({ party: z.string() }) }) }),
          z.object({ CanReadAs: z.object({ value: z.object({ party: z.string() }) }) }),
          z.object({ CanReadAsAnyParty: z.object({ value: z.object({}) }) }),
          z.object({ CanExecuteAs: z.object({ value: z.object({ party: z.string() }) }) }),
          z.object({ CanExecuteAsAnyParty: z.object({ value: z.object({}) }) }),
          z.object({ Empty: z.object({ value: z.object({}) }) }),
          z.object({ IdentityProviderAdmin: z.object({ value: z.object({}) }) }),
          z.object({ ParticipantAdmin: z.object({ value: z.object({}) }) }),
        ]),
      })
    )
    .optional(),
});

/** Schema for revoke user rights parameters. */
export const RevokeUserRightsParamsSchema = z.object({
  /** User ID to revoke rights from. */
  userId: NonEmptyStringSchema,
  /** Rights to revoke (optional). */
  rights: z
    .array(
      z.object({
        /** The kind of right. */
        kind: z.union([
          z.object({ CanActAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAs: z.object({ party: z.string() }) }),
          z.object({ CanReadAsAnyParty: z.object({}) }),
          z.object({ Empty: z.object({}) }),
          z.object({ IdentityProviderAdmin: z.object({}) }),
          z.object({ ParticipantAdmin: z.object({}) }),
        ]),
      })
    )
    .optional(),
});

/** Schema for update user identity provider parameters. */
export const UpdateUserIdentityProviderParamsSchema = z.object({
  /** User ID to update. */
  userId: NonEmptyStringSchema,
  /** Current identity provider ID. */
  sourceIdentityProviderId: z.string(),
  /** Target identity provider ID. */
  targetIdentityProviderId: z.string(),
});

/** Schema for get authenticated user parameters. */
export const GetAuthenticatedUserParamsSchema = z.object({});

// Export types
export type ListUsersParams = z.infer<typeof ListUsersParamsSchema>;
export type CreateUserParams = z.infer<typeof CreateUserParamsSchema>;
export type GetUserParams = z.infer<typeof GetUserParamsSchema>;
export type DeleteUserParams = z.infer<typeof DeleteUserParamsSchema>;
export type UpdateUserParams = z.infer<typeof UpdateUserParamsSchema>;
export type ListUserRightsParams = z.infer<typeof ListUserRightsParamsSchema>;
export type GrantUserRightsParams = z.infer<typeof GrantUserRightsParamsSchema>;
export type RevokeUserRightsParams = z.infer<typeof RevokeUserRightsParamsSchema>;
export type UpdateUserIdentityProviderParams = z.infer<typeof UpdateUserIdentityProviderParamsSchema>;
export type GetAuthenticatedUserParams = z.infer<typeof GetAuthenticatedUserParamsSchema>;
