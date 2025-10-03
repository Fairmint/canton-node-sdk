import { createApiOperation } from '../../../../../core';
import { type z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetParticipantIdParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/parties/participant-id' as const;

export type GetParticipantIdParams = z.infer<typeof GetParticipantIdParamsSchema>;
export type GetParticipantIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const GetParticipantId = createApiOperation<GetParticipantIdParams, GetParticipantIdResponse>({
  paramsSchema: GetParticipantIdParamsSchema,
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 