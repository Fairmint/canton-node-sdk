import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/transaction-by-id' as const;

export type GetTransactionByIdParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetTransactionByIdResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetTransactionById = createApiOperation<GetTransactionByIdParams, GetTransactionByIdResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 