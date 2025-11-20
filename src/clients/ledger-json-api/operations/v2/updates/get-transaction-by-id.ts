import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetTransactionByIdParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/updates/transaction-by-id' as const;

export type GetTransactionByIdParams = z.infer<typeof GetTransactionByIdParamsSchema>;
export type GetTransactionByIdResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Get a transaction by its update ID
 *
 * @example
 *   ```typescript
 *   const result = await client.getTransactionById({
 *     updateId: '00000000000000000000',
 *     parties: ['party1']
 *   });
 *
 *   ```;
 */
export const GetTransactionById = createApiOperation<GetTransactionByIdParams, GetTransactionByIdResponse>({
  paramsSchema: GetTransactionByIdParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
});
