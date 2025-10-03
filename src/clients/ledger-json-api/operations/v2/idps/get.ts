import { createApiOperation } from '../../../../../core';
import { type ListIdentityProviderConfigsResponse } from '../../../schemas/api';
import {
  ListIdentityProviderConfigsParamsSchema,
  type ListIdentityProviderConfigsParams,
} from '../../../schemas/operations';

/**
 * List all identity provider configs
 *
 * @example
 *   ```typescript
 *   const result = await client.listIdentityProviderConfigs();
 *
 *   ```;
 */
export const ListIdentityProviderConfigs = createApiOperation<
  ListIdentityProviderConfigsParams,
  ListIdentityProviderConfigsResponse
>({
  paramsSchema: ListIdentityProviderConfigsParamsSchema,
  method: 'GET',
  buildUrl: (_params: ListIdentityProviderConfigsParams, apiUrl: string) => `${apiUrl}/v2/idps`,
});
