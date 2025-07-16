import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

// Type aliases for better readability and to avoid repetition
type DeleteUserResponse = paths['/v2/users/{user-id}']['delete']['responses']['200']['content']['application/json'];

// Schema for the parameters
export const DeleteUserParamsSchema = z.object({
  /** User ID to delete */
  userId: z.string(),
});

export type DeleteUserParams = z.infer<typeof DeleteUserParamsSchema>;

/**
 * @description Delete a user
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