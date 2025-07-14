import { createApiOperation } from '../../../../../core';
import { UpdateUserParamsSchema, UpdateUserParams } from '../../../schemas/operations';
import { UpdateUserResponse } from '../../../schemas/api';

/**
 * @description Update a user on the participant node
 * @example
 * ```typescript
 * const updatedUser = await client.updateUser({
 *   userId: 'alice',
 *   user: {
 *     id: 'alice',
 *     primaryParty: 'Alice::1220',
 *     isDeactivated: false,
 *     metadata: {
 *       resourceVersion: '123',
 *       annotations: { 'displayName': 'Alice Smith' }
 *     }
 *   },
 *   updateMask: {
 *     paths: ['primaryParty', 'metadata.annotations']
 *   }
 * });
 * ```
 */
export const UpdateUser = createApiOperation<
  UpdateUserParams,
  UpdateUserResponse
>({
  paramsSchema: UpdateUserParamsSchema,
  method: 'PATCH',
  buildUrl: (params: UpdateUserParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}`,
  buildRequestData: (params: UpdateUserParams) => {
    const requestBody: any = {
      user: params.user,
      updateMask: params.updateMask,
    };
    
    return requestBody;
  },
}); 