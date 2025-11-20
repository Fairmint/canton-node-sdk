import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetTransactionByOffsetParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/updates/transaction-by-offset' as const;

export type GetTransactionByOffsetParams = z.infer<typeof GetTransactionByOffsetParamsSchema>;
export type GetTransactionByOffsetResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Get a transaction by its ledger offset
 *
 * @example
 *   ```typescript
 *   const result = await client.getTransactionByOffset({
 *     offset: '00000000000000000000',
 *     parties: ['party1']
 *   });
 *
 *   ```;
 */
export const GetTransactionByOffset = createApiOperation<GetTransactionByOffsetParams, GetTransactionByOffsetResponse>({
  paramsSchema: GetTransactionByOffsetParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
});
