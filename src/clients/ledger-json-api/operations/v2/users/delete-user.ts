import { createApiOperation } from '../../../../../core';
import { DeleteUserParamsSchema, DeleteUserParams } from '../../../schemas/operations';
import { DeleteUserResponse } from '../../../schemas/api';

/**
 * @description Delete a user from the participant node
 * @example
 * ```typescript
 * await client.deleteUser({ userId: 'alice' });
 * console.log('User deleted successfully');
 * ```
 */
export const DeleteUser = createApiOperation<
  DeleteUserParams,
  DeleteUserResponse
>({
  paramsSchema: DeleteUserParamsSchema,
  method: 'DELETE',
  buildUrl: (params: DeleteUserParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}`,
}); 