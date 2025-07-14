import { createApiOperation } from '../../../../../core';
import { GetPartyDetailsParamsSchema, GetPartyDetailsParams } from '../../../schemas/operations';
import { GetPartiesResponse } from '../../../schemas/api';

/**
 * @description Get party details
 * @example
 * ```typescript
 * const partyDetails = await client.getPartyDetails({ party: 'alice' });
 * console.log(`Party ${partyDetails.partyDetails[0].party} is local: ${partyDetails.partyDetails[0].isLocal}`);
 * ```
 */
export const GetPartyDetails = createApiOperation<
  GetPartyDetailsParams,
  GetPartiesResponse
>({
  paramsSchema: GetPartyDetailsParamsSchema,
  method: 'GET',
  buildUrl: (params: GetPartyDetailsParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/parties/${params.party}`);
    if (params.identityProviderId !== undefined) {
      url.searchParams.set('identity-provider-id', params.identityProviderId);
    }
    if (params.parties !== undefined) {
      params.parties.forEach(party => {
        url.searchParams.append('parties', party);
      });
    }
    return url.toString();
  },
}); 