import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetLedgerEndParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/state/ledger-end' as const;

export type GetLedgerEndParams = z.infer<typeof GetLedgerEndParamsSchema>;
export type GetLedgerEndResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * Get the current ledger end offset
 *
 * @example
 *   ```typescript
 *   const result = await client.getLedgerEnd({});
 *   console.log('Ledger end offset:', result.offset);
 *
 *   ```;
 */
export const GetLedgerEnd = createApiOperation<GetLedgerEndParams, GetLedgerEndResponse>({
  paramsSchema: GetLedgerEndParamsSchema,
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
});
