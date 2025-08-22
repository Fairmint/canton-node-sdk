import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetTransactionByOffsetParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/updates/transaction-by-offset' as const;

export type GetTransactionByOffsetParams = z.infer<typeof GetTransactionByOffsetParamsSchema>;
export type GetTransactionByOffsetResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetTransactionByOffset = createApiOperation<GetTransactionByOffsetParams, GetTransactionByOffsetResponse>({
  paramsSchema: GetTransactionByOffsetParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 