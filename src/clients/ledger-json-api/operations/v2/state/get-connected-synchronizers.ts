import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetConnectedSynchronizersParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/state/connected-synchronizers' as const;

export type GetConnectedSynchronizersParams = z.infer<typeof GetConnectedSynchronizersParamsSchema>;
export type GetConnectedSynchronizersResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetConnectedSynchronizers = createApiOperation<GetConnectedSynchronizersParams, GetConnectedSynchronizersResponse>({
  paramsSchema: GetConnectedSynchronizersParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}${endpoint}`);
    if (params.party) url.searchParams.set('party', params.party);
    if (params.participantId) url.searchParams.set('participantId', params.participantId);
    return url.toString();
  },
  buildRequestData: () => ({}),
}); 