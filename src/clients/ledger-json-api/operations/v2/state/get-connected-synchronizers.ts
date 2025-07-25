import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/state/connected-synchronizers' as const;

export type GetConnectedSynchronizersParams = paths[typeof endpoint]['get']['parameters']['query'];
export type GetConnectedSynchronizersResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetConnectedSynchronizers = createApiOperation<GetConnectedSynchronizersParams, GetConnectedSynchronizersResponse>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 