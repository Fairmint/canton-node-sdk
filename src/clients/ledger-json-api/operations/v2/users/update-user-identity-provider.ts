import { createApiOperation } from '../../../../../core';
import { UpdateUserIdentityProviderParamsSchema, UpdateUserIdentityProviderParams } from '../../../schemas/operations';
import { UpdateUserIdentityProviderIdResponse } from '../../../schemas/api';

/**
 * @description Update the identity provider for a user
 * @example
 * ```typescript
 * await client.updateUserIdentityProvider({
 *   userId: 'alice',
 *   sourceIdentityProviderId: 'old-provider',
 *   targetIdentityProviderId: 'new-provider'
 * });
 * console.log('User identity provider updated successfully');
 * ```
 */
export const UpdateUserIdentityProvider = createApiOperation<
  UpdateUserIdentityProviderParams,
  UpdateUserIdentityProviderIdResponse
>({
  paramsSchema: UpdateUserIdentityProviderParamsSchema,
  method: 'PATCH',
  buildUrl: (params: UpdateUserIdentityProviderParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}/identity-provider-id`,
  buildRequestData: (params: UpdateUserIdentityProviderParams) => {
    const requestBody = {
      userId: params.userId,
      sourceIdentityProviderId: params.sourceIdentityProviderId,
      targetIdentityProviderId: params.targetIdentityProviderId,
    };
    
    return requestBody;
  },
}); 