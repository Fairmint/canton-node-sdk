import { createApiOperation } from '../../../../../core';
import { GetAuthenticatedUserParamsSchema, GetAuthenticatedUserParams } from '../../../schemas/operations';
import { GetUserResponse } from '../../../schemas/api';

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
  GetUserResponse
>({
  paramsSchema: GetAuthenticatedUserParamsSchema,
  method: 'GET',
  buildUrl: (params: GetAuthenticatedUserParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/authenticated-user`;
    const queryParams = new URLSearchParams();
    
    if (params.identityProviderId) {
      queryParams.append('identity-provider-id', params.identityProviderId);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 