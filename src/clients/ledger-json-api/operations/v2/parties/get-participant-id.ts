import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
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
  void,
  GetParticipantIdResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/v2/parties/participant-id`,
}); 