import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/users';

export const ListUsersParamsSchema = z.object({
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});

export type ListUsersParams = z.infer<typeof ListUsersParamsSchema>;
export type ListUsersResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const ListUsers = createApiOperation<ListUsersParams, ListUsersResponse>({
  paramsSchema: ListUsersParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users`;
    const queryParams = new URLSearchParams();
    if (params.pageSize !== undefined) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params.pageToken) {
      queryParams.append('pageToken', params.pageToken);
    }
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
