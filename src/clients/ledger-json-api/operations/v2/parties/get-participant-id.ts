import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/parties/participant-id' as const;

export type GetParticipantIdParams = paths[typeof endpoint]['get']['parameters']['query'];
export type GetParticipantIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetParticipantId = createApiOperation<GetParticipantIdParams, GetParticipantIdResponse>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 