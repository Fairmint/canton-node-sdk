import { BaseClient, createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { CreateUserResponse } from '../../../schemas/api';

// Type aliases for better readability and to avoid repetition
type CreateUserRequest = paths['/v2/users']['post']['requestBody']['content']['application/json'];

// Schema for the parameters  
export const CreateUserParamsSchema = z.object({
  /** User to create */
  user: z.object({
    /** User ID */
    id: z.string(),
    /** Primary party ID (required) */
    primaryParty: z.string(),
    /** Is deactivated */
    isDeactivated: z.boolean(),
    /** Identity provider ID */
    identityProviderId: z.string(),
    /** Metadata (optional) */
    metadata: z.object({
      resourceVersion: z.string(),
      annotations: z.record(z.string(), z.string()),
    }).optional(),
  }),
  /** Initial user rights (optional) */
  rights: z.array(z.any()).optional(),
});

export type CreateUserParams = z.infer<typeof CreateUserParamsSchema>;

/**
 * @description Create a new user
 * @example
 * ```typescript
 * const user = await client.createUser({
 *   user: {
 *     id: 'alice',
 *     primaryParty: 'alice-party',
 *     isDeactivated: false,
 *     identityProviderId: 'default'
 *   }
 * });
 * console.log(`Created user: ${user.user.id}`);
 * ```
 */
export const CreateUser = createApiOperation<
  CreateUserParams,
  CreateUserResponse
>({
  paramsSchema: CreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params: CreateUserParams, apiUrl: string) => `${apiUrl}/v2/users`,
  buildRequestData: (params: CreateUserParams, _client: BaseClient): CreateUserRequest => {
    return {
      user: params.user,
      rights: params.rights,
    };
  },
}); 