import { createApiOperation } from '../../../../../core';
import { ListUsersParamsSchema, ListUsersParams } from '../../../schemas/operations';
import { ListUsersResponse } from '../../../schemas/api';

/**
 * @description List all users on the participant node
 * @example
 * ```typescript
 * const users = await client.listUsers({ pageSize: 10 });
 * console.log(`Found ${users.users.length} users`);
 * ```
 */
export const ListUsers = createApiOperation<
  ListUsersParams,
  ListUsersResponse
>({
  paramsSchema: ListUsersParamsSchema,
  method: 'GET',
  buildUrl: (params: ListUsersParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/users`;
    const queryParams = new URLSearchParams();
    
    if (params.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    
    if (params.pageToken) {
      queryParams.append('pageToken', params.pageToken);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 