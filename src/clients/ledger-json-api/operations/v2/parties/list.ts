import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/parties';

export const ListPartiesParamsSchema = z.object({
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});

export type ListPartiesParams = z.infer<typeof ListPartiesParamsSchema>;
export type ListPartiesResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/** List all parties known to the participant Alias for getParties for consistency with other list operations */
export const ListParties = createApiOperation<ListPartiesParams, ListPartiesResponse>({
  paramsSchema: ListPartiesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}${endpoint}`);
    if (params.pageSize) url.searchParams.set('pageSize', params.pageSize.toString());
    if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
    return url.toString();
  },
});
