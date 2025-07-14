import { createApiOperation } from '../../../../../core';
import { GetParticipantIdParamsSchema, GetParticipantIdParams } from '../../../schemas/operations';
import { GetParticipantIdResponse } from '../../../schemas/api';

/**
 * @description Get participant ID
 * @example
 * ```typescript
 * const participant = await client.getParticipantId();
 * console.log(`Participant ID: ${participant.participantId}`);
 * ```
 */
export const GetParticipantId = createApiOperation<
  GetParticipantIdParams,
  GetParticipantIdResponse
>({
  paramsSchema: GetParticipantIdParamsSchema,
  method: 'GET',
  buildUrl: (_params: GetParticipantIdParams, apiUrl: string) => `${apiUrl}/v2/parties/participant-id`,
}); 