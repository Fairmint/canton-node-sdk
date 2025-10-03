import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { UpdateUserParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/users/{user-id}' as const;

// The params type should include both path parameters and request body
export type UpdateUserParams = z.infer<typeof UpdateUserParamsSchema>;

export type UpdateUserResponse = paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const UpdateUser = createApiOperation<UpdateUserParams, UpdateUserResponse>({
  paramsSchema: UpdateUserParamsSchema,
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
});
