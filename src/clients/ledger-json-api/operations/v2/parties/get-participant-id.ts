import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/parties/participant-id' as const;

export type GetParticipantIdParams = paths[typeof endpoint]['get']['parameters']['query'];
export type GetParticipantIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetParticipantId = createApiOperation<GetParticipantIdParams, GetParticipantIdResponse>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 