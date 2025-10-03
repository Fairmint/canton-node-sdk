import { createApiOperation } from '../../../../../core';
import { type GetIdentityProviderConfigResponse } from '../../../schemas/api';
import {
  GetIdentityProviderConfigParamsSchema,
  type GetIdentityProviderConfigParams,
} from '../../../schemas/operations';

/**
 * Get identity provider config
 *
 * @example
 *   ```typescript
 *   const result = await client.getIdentityProviderConfig({ idpId: 'my-idp' });
 *   console.log(result.identityProviderConfig);
 *   ```;
 */
export const GetIdentityProviderConfig = createApiOperation<
  GetIdentityProviderConfigParams,
  GetIdentityProviderConfigResponse
>({
  paramsSchema: GetIdentityProviderConfigParamsSchema,
  method: 'GET',
  buildUrl: (params: GetIdentityProviderConfigParams, apiUrl: string) => `${apiUrl}/v2/idps/${params.idpId}`,
});
