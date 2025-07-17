import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/users/{user-id}/identity-provider-id' as const;

// The params type should include both path parameters and request body
export type UpdateUserIdentityProviderParams = {
  userId: string; // Path parameter
} & paths[typeof endpoint]['patch']['requestBody']['content']['application/json'];

export type UpdateUserIdentityProviderResponse = paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const UpdateUserIdentityProvider = createApiOperation<UpdateUserIdentityProviderParams, UpdateUserIdentityProviderResponse>({
  paramsSchema: z.any(),
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/identity-provider-id`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
}); 