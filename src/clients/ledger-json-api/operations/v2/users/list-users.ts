import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { ListUsersResponse } from '../../../schemas/api';

// Schema for the parameters
export const ListUsersParamsSchema = z.object({
  /** Maximum number of elements in a returned page */
  pageSize: z.number().int().optional(),
  /** Token to continue results from a given page */
  pageToken: z.string().optional(),
});

export type ListUsersParams = z.infer<typeof ListUsersParamsSchema>;

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