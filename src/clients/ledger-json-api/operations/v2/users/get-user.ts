import { createApiOperation } from '../../../../../core';
import { GetUserParamsSchema, GetUserParams } from '../../../schemas/operations';
import { GetUserResponse } from '../../../schemas/api';

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
  buildUrl: (params: GetUserParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/users/${params.userId}`;
    const queryParams = new URLSearchParams();
    
    if (params.identityProviderId) {
      queryParams.append('identity-provider-id', params.identityProviderId);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 