import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/users/{user-id}' as const;

// The params type should include both path parameters and request body
export type UpdateUserParams = {
  userId: string; // Path parameter
} & paths[typeof endpoint]['patch']['requestBody']['content']['application/json'];

export type UpdateUserResponse = paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const UpdateUser = createApiOperation<UpdateUserParams, UpdateUserResponse>({
  paramsSchema: z.any(),
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
}); 