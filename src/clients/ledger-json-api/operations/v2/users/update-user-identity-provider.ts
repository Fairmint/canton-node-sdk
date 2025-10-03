import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { UpdateUserIdentityProviderParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/users/{user-id}/identity-provider-id' as const;

// The params type should include both path parameters and request body
export type UpdateUserIdentityProviderParams = z.infer<typeof UpdateUserIdentityProviderParamsSchema>;

export type UpdateUserIdentityProviderResponse =
  paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const UpdateUserIdentityProvider = createApiOperation<
  UpdateUserIdentityProviderParams,
  UpdateUserIdentityProviderResponse
>({
  paramsSchema: UpdateUserIdentityProviderParamsSchema,
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/identity-provider-id`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
});
