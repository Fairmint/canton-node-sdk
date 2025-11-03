import { createApiOperation } from '../../../../../core';
import { type GetUserResponse } from '../../../schemas/api';
import { GetAuthenticatedUserParamsSchema, type GetAuthenticatedUserParams } from '../../../schemas/operations';

/**
 * Get details for the currently authenticated user
 *
 * @example
 *   ```typescript
 *   const user = await client.getAuthenticatedUser({});
 *
 *   ```;
 */
export const GetAuthenticatedUser = createApiOperation<GetAuthenticatedUserParams, GetUserResponse>({
  paramsSchema: GetAuthenticatedUserParamsSchema,
  method: 'GET',
  buildUrl: (_params: GetAuthenticatedUserParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/authenticated-user`;
    const queryParams = new URLSearchParams();

    // Always pass empty string for identity-provider-id
    queryParams.append('identity-provider-id', '');

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
