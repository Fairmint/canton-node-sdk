import { createApiOperation } from '../../../../../core';
import { GetConnectedSynchronizersParamsSchema, GetConnectedSynchronizersParams } from '../../../schemas/operations';
import { GetConnectedSynchronizersResponse } from '../../../schemas/api';

/**
 * @description Get connected synchronizers for a party
 * @example
 * ```typescript
 * const synchronizers = await client.getConnectedSynchronizers({
 *   party: 'party1',
 *   participantId: 'participant1'
 * });
 * ```
 * @param party - Party to get synchronizers for
 * @param participantId - Participant ID (optional)
 */
export const GetConnectedSynchronizers = createApiOperation<
  GetConnectedSynchronizersParams,
  GetConnectedSynchronizersResponse
>({
  paramsSchema: GetConnectedSynchronizersParamsSchema,
  method: 'GET',
  buildUrl: (params: GetConnectedSynchronizersParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/state/connected-synchronizers`);
    url.searchParams.set('party', params.party);
    if (params.participantId !== undefined) {
      url.searchParams.set('participantId', params.participantId);
    }
    return url.toString();
  },
}); 