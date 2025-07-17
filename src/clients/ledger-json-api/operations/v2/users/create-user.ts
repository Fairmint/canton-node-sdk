import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/users' as const;

export type CreateUserParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type CreateUserResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const CreateUser = createApiOperation<CreateUserParams, CreateUserResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 