import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/state/ledger-end' as const;

export type GetLedgerEndParams = paths[typeof endpoint]['get']['parameters']['query'];
export type GetLedgerEndResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetLedgerEnd = createApiOperation<GetLedgerEndParams, GetLedgerEndResponse>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 