import { createApiOperation } from '../../../../../core';
import { ListIdentityProviderConfigsParamsSchema, type ListIdentityProviderConfigsParams } from '../../../schemas/operations';
import { type ListIdentityProviderConfigsResponse } from '../../../schemas/api';

/**
 * @description List all identity provider configs
 * @example
 * ```typescript
 * const result = await client.listIdentityProviderConfigs();
 * console.log(result.identityProviderConfigs);
 * ```
 */
export const ListIdentityProviderConfigs = createApiOperation<
  ListIdentityProviderConfigsParams,
  ListIdentityProviderConfigsResponse
>({
  paramsSchema: ListIdentityProviderConfigsParamsSchema,
  method: 'GET',
  buildUrl: (_params: ListIdentityProviderConfigsParams, apiUrl: string) => `${apiUrl}/v2/idps`,
}); 