import { createApiOperation } from '../../../../../core';
import { GrantUserRightsParamsSchema, GrantUserRightsParams } from '../../../schemas/operations';
import { GrantUserRightsResponse, GrantUserRightsRequest } from '../../../schemas/api';

/**
 * @description Grant rights to a user
 * @example
 * ```typescript
 * const result = await client.grantUserRights({
 *   userId: 'alice',
 *   rights: [
 *     { kind: { CanActAs: { party: 'Alice::1220' } } },
 *     { kind: { CanReadAs: { party: 'Bob::1221' } } }
 *   ],
 *   identityProviderId: 'default'
 * });
 * console.log(`Granted ${result.newlyGrantedRights.length} new rights`);
 * ```
 */
export const GrantUserRights = createApiOperation<
  GrantUserRightsParams,
  GrantUserRightsResponse
>({
  paramsSchema: GrantUserRightsParamsSchema,
  method: 'POST',
  buildUrl: (params: GrantUserRightsParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}/rights`,
  buildRequestData: (params: GrantUserRightsParams): GrantUserRightsRequest => {
    const requestBody: GrantUserRightsRequest = {
      userId: params.userId,
    };
    
    if (params.rights) {
      requestBody.rights = params.rights;
    }
    
    if (params.identityProviderId) {
      requestBody.identityProviderId = params.identityProviderId;
    }
    
    return requestBody;
  },
}); 