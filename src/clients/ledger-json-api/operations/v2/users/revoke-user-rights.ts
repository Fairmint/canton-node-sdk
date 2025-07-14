import { createApiOperation } from '../../../../../core';
import { RevokeUserRightsParamsSchema, RevokeUserRightsParams } from '../../../schemas/operations';
import { RevokeUserRightsResponse, RevokeUserRightsRequest } from '../../../schemas/api';

/**
 * @description Revoke rights from a user
 * @example
 * ```typescript
 * const result = await client.revokeUserRights({
 *   userId: 'alice',
 *   rights: [
 *     { kind: { CanActAs: { party: 'Alice::1220' } } }
 *   ],
 *   identityProviderId: 'default'
 * });
 * console.log(`Revoked ${result.newlyRevokedRights.length} rights`);
 * ```
 */
export const RevokeUserRights = createApiOperation<
  RevokeUserRightsParams,
  RevokeUserRightsResponse
>({
  paramsSchema: RevokeUserRightsParamsSchema,
  method: 'PATCH',
  buildUrl: (params: RevokeUserRightsParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}/rights`,
  buildRequestData: (params: RevokeUserRightsParams): RevokeUserRightsRequest => {
    const requestBody: RevokeUserRightsRequest = {
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