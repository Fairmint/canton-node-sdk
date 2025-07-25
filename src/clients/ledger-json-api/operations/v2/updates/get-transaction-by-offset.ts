import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/updates/transaction-by-offset' as const;

export type GetTransactionByOffsetParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetTransactionByOffsetResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetTransactionByOffset = createApiOperation<GetTransactionByOffsetParams, GetTransactionByOffsetResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 