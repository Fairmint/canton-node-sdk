import { createApiOperation } from '../../../../../core';
import { GetIdentityProviderConfigParamsSchema, GetIdentityProviderConfigParams } from '../../../schemas/operations';
import { GetIdentityProviderConfigResponse } from '../../../schemas/api';

/**
 * @description Get identity provider config
 * @example
 * ```typescript
 * const result = await client.getIdentityProviderConfig({ idpId: 'my-idp' });
 * console.log(result.identityProviderConfig);
 * ```
 */
export const GetIdentityProviderConfig = createApiOperation<
  GetIdentityProviderConfigParams,
  GetIdentityProviderConfigResponse
>({
  paramsSchema: GetIdentityProviderConfigParamsSchema,
  method: 'GET',
  buildUrl: (params: GetIdentityProviderConfigParams, apiUrl: string) => `${apiUrl}/v2/idps/${params.idpId}`,
}); 