import { createApiOperation } from '../../../../../core';
import { z } from 'zod';

const endpoint = '/v2/authenticated-user' as const;

// Custom params schema for user input
export const GetAuthenticatedUserParamsSchema = z.object({
  /** The identity provider ID to filter by (optional). */
  identityProviderId: z.string().optional(),
});

export type GetAuthenticatedUserParams = z.infer<typeof GetAuthenticatedUserParamsSchema>;

// For this endpoint, we don't have generated types, so we define response type inline
export type GetAuthenticatedUserResponse = {
  user: {
    id: string;
    primaryParty: string;
    isDeactivated: boolean;
    metadata?: {
      resourceVersion: string;
      annotations: { [key: string]: string };
    };
    identityProviderId: string;
  };
};

/**
 * @description Get details for the currently authenticated user
 * @example
 * ```typescript
 * const user = await client.getAuthenticatedUser({ identityProviderId: 'default' });
 * console.log(`Authenticated as: ${user.user.id}`);
 * ```
 */
export const GetAuthenticatedUser = createApiOperation<
  GetAuthenticatedUserParams,
  GetAuthenticatedUserResponse
>({
  paramsSchema: GetAuthenticatedUserParamsSchema,
  method: 'GET',
  buildUrl: (params: GetAuthenticatedUserParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}${endpoint}`;
    const queryParams = new URLSearchParams();
    
    if (params.identityProviderId) {
      queryParams.append('identity-provider-id', params.identityProviderId);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 