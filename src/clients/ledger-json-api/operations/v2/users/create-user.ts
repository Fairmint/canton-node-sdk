import { createApiOperation } from '../../../../../core';
import { type z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { CreateUserParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/users' as const;

export type CreateUserParams = z.infer<typeof CreateUserParamsSchema>;
export type CreateUserResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const CreateUser = createApiOperation<CreateUserParams, CreateUserResponse>({
  paramsSchema: CreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 