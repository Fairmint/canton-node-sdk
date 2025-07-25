import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/users/{user-id}';

export const GetUserParamsSchema = z.object({
  userId: z.string(),
  identityProviderId: z.string().optional(),
});

export type GetUserParams = z.infer<typeof GetUserParamsSchema>;
export type GetUserResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * @description Get details for a specific user
 * @example
 * ```typescript
 * const user = await client.getUser({ userId: 'alice' });
 * console.log(`User ${user.user.id} is ${user.user.isDeactivated ? 'deactivated' : 'active'}`);
 * ```
 */
export const GetUser = createApiOperation<
  GetUserParams,
  GetUserResponse
>({
  paramsSchema: GetUserParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users/${params.userId}`;
    const queryParams = new URLSearchParams();
    if (params.identityProviderId) {
      queryParams.append('identity-provider-id', params.identityProviderId);
    }
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 