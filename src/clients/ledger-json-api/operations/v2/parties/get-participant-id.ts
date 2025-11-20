import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetParticipantIdParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/parties/participant-id' as const;

export type GetParticipantIdParams = z.infer<typeof GetParticipantIdParamsSchema>;
export type GetParticipantIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * Get the participant ID of the current node
 *
 * @example
 *   ```typescript
 *   const result = await client.getParticipantId({});
 *   console.log('Participant ID:', result.participantId);
 *
 *   ```;
 */
export const GetParticipantId = createApiOperation<GetParticipantIdParams, GetParticipantIdResponse>({
  paramsSchema: GetParticipantIdParamsSchema,
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
});
