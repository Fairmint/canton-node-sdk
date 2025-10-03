import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

type Endpoint = '/v2/users/{user-id}';

export const DeleteUserParamsSchema = z.object({
  userId: z.string(),
});

export type DeleteUserParams = z.infer<typeof DeleteUserParamsSchema>;
export type DeleteUserResponse = paths[Endpoint]['delete']['responses']['200']['content']['application/json'];

export const DeleteUser = createApiOperation<DeleteUserParams, DeleteUserResponse>({
  paramsSchema: DeleteUserParamsSchema,
  method: 'DELETE',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}`,
});
