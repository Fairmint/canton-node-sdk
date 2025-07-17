import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/transaction-tree-by-id/{update-id}';

export const GetTransactionTreeByIdParamsSchema = z.object({
  updateId: z.string(),
  verbose: z.boolean().optional(),
});

export type GetTransactionTreeByIdParams = z.infer<typeof GetTransactionTreeByIdParamsSchema>;
export type GetTransactionTreeByIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetTransactionTreeById = createApiOperation<
  GetTransactionTreeByIdParams,
  GetTransactionTreeByIdResponse
>({
  paramsSchema: GetTransactionTreeByIdParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}${endpoint.replace('{update-id}', params.updateId)}`);
    if (params.verbose) url.searchParams.set('verbose', params.verbose.toString());
    return url.toString();
  },
}); 