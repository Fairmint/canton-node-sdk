import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/parties';

export const GetPartiesParamsSchema = z.object({
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});

export type GetPartiesParams = z.infer<typeof GetPartiesParamsSchema>;
export type GetPartiesResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetParties = createApiOperation<GetPartiesParams, GetPartiesResponse>({
  paramsSchema: GetPartiesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}${endpoint}`);
    if (params.pageSize) url.searchParams.set('pageSize', params.pageSize.toString());
    if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
    return url.toString();
  },
});
