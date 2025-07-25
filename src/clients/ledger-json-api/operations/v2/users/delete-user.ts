import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/users/{user-id}';

export const DeleteUserParamsSchema = z.object({
  userId: z.string(),
});

export type DeleteUserParams = z.infer<typeof DeleteUserParamsSchema>;
export type DeleteUserResponse = paths[typeof endpoint]['delete']['responses']['200']['content']['application/json'];

export const DeleteUser = createApiOperation<
  DeleteUserParams,
  DeleteUserResponse
>({
  paramsSchema: DeleteUserParamsSchema,
  method: 'DELETE',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}`,
}); 