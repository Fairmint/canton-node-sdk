import { createApiOperation } from '../../../../../core';
import { UpdatePartyDetailsParamsSchema, UpdatePartyDetailsParams } from '../../../schemas/operations';
import { UpdatePartyDetailsResponse } from '../../../schemas/api';

/**
 * @description Update party details
 * @example
 * ```typescript
 * const updatedParty = await client.updatePartyDetails({
 *   party: 'alice',
 *   partyDetails: {
 *     party: 'alice',
 *     isLocal: true,
 *     localMetadata: {
 *       resourceVersion: '1',
 *       annotations: { 'displayName': 'Alice' }
 *     }
 *   },
 *   updateMask: { paths: ['localMetadata.annotations'] }
 * });
 * console.log(`Updated party: ${updatedParty.partyDetails.party}`);
 * ```
 */
export const UpdatePartyDetails = createApiOperation<
  UpdatePartyDetailsParams,
  UpdatePartyDetailsResponse
>({
  paramsSchema: UpdatePartyDetailsParamsSchema,
  method: 'PATCH',
  buildUrl: (params: UpdatePartyDetailsParams, apiUrl: string) => `${apiUrl}/v2/parties/${params.party}`,
}); 