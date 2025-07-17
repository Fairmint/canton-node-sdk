import { createApiOperation } from '../../../../../core';
import { GetPartyDetailsParamsSchema, GetPartyDetailsParams } from '../../../schemas/operations';
import { GetPartiesResponse } from '../../../schemas/api';

const endpoint = '/v2/parties/{party}' as const;

/**
 * @description Get party details for a specific party
 * @example
 * ```typescript
 * const partyDetails = await client.getPartyDetails({ 
 *   party: 'alice@example.com',
 *   identityProviderId: 'default'
 * });
 * console.log(`Party: ${partyDetails.partyDetails[0].party}`);
 * ```
 */
export const GetPartyDetails = createApiOperation<
  GetPartyDetailsParams,
  GetPartiesResponse
>({
  paramsSchema: GetPartyDetailsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}/v2/parties/${params.party}`);
    
    if (params.identityProviderId) {
      url.searchParams.set('identity-provider-id', params.identityProviderId);
    }
    
    if (params.parties && params.parties.length > 0) {
      params.parties.forEach(party => {
        url.searchParams.append('parties', party);
      });
    }
    
    return url.toString();
  },
}); 