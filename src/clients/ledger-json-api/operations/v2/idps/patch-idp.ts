import { createApiOperation } from '../../../../../core';
import { type UpdateIdentityProviderConfigResponse } from '../../../schemas/api';
import {
  UpdateIdentityProviderConfigParamsSchema,
  type UpdateIdentityProviderConfigParams,
} from '../../../schemas/operations';

/**
 * Update identity provider config
 *
 * @example
 *   ```typescript
 *   const result = await client.updateIdentityProviderConfig({
 *     identityProviderConfig: { ... },
 *     updateMask: { paths: ['isDeactivated'] }
 *   });
 *   console.log(result.identityProviderConfig);
 *   ```;
 */
export const UpdateIdentityProviderConfig = createApiOperation<
  UpdateIdentityProviderConfigParams,
  UpdateIdentityProviderConfigResponse
>({
  paramsSchema: UpdateIdentityProviderConfigParamsSchema,
  method: 'PATCH',
  buildUrl: (params: UpdateIdentityProviderConfigParams, apiUrl: string) =>
    `${apiUrl}/v2/idps/${params.identityProviderConfig.identityProviderId}`,
  buildRequestData: (params: UpdateIdentityProviderConfigParams) => ({
    identityProviderConfig: params.identityProviderConfig,
    updateMask: params.updateMask,
  }),
});
