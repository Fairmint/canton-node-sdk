import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { UpdateUserIdentityProviderParamsSchema } from '../../../schemas/operations';

type Endpoint = '/v2/users/{user-id}/identity-provider-id';

// The params type should include both path parameters and request body
export type UpdateUserIdentityProviderParams = z.infer<typeof UpdateUserIdentityProviderParamsSchema>;

export type UpdateUserIdentityProviderResponse =
  paths[Endpoint]['patch']['responses']['200']['content']['application/json'];

/**
 * Update the identity provider for a user
 *
 * @example
 *   ```typescript
 *   const result = await client.updateUserIdentityProvider({
 *     userId: 'alice',
 *     sourceIdentityProviderId: 'old-idp',
 *     targetIdentityProviderId: 'new-idp'
 *   });
 *
 *   ```;
 */
export const UpdateUserIdentityProvider = createApiOperation<
  UpdateUserIdentityProviderParams,
  UpdateUserIdentityProviderResponse
>({
  paramsSchema: UpdateUserIdentityProviderParamsSchema,
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/identity-provider-id`,
  buildRequestData: (params) => {
    const { userId: _userId, ...requestBody } = params;
    return requestBody;
  },
});
