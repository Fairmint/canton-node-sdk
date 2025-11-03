import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

type Endpoint = '/v2/users/{user-id}';

export const GetUserParamsSchema = z.object({
  userId: z.string(),
});

export type GetUserParams = z.infer<typeof GetUserParamsSchema>;
export type GetUserResponse = paths[Endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * Get details for a specific user
 *
 * @example
 *   ```typescript
 *   const user = await client.getUser({ userId: 'alice' });
 *
 *   ```;
 */
export const GetUser = createApiOperation<GetUserParams, GetUserResponse>({
  paramsSchema: GetUserParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users/${params.userId}`;
    const queryParams = new URLSearchParams();
    // Always pass empty string for identity-provider-id
    queryParams.append('identity-provider-id', '');
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
