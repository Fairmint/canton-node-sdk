import { createApiOperation } from '../../../../../core';
import { type CreateIdentityProviderConfigResponse } from '../../../schemas/api';
import {
  CreateIdentityProviderConfigParamsSchema,
  type CreateIdentityProviderConfigParams,
} from '../../../schemas/operations';

/**
 * Create identity provider config
 *
 * @example
 *   ```typescript
 *   const result = await client.createIdentityProviderConfig({
 *     identityProviderConfig: { ... }
 *   });
 *   console.log(result.identityProviderConfig);
 *   ```;
 */
export const CreateIdentityProviderConfig = createApiOperation<
  CreateIdentityProviderConfigParams,
  CreateIdentityProviderConfigResponse
>({
  paramsSchema: CreateIdentityProviderConfigParamsSchema,
  method: 'POST',
  buildUrl: (_params: CreateIdentityProviderConfigParams, apiUrl: string) => `${apiUrl}/v2/idps`,
  buildRequestData: (params: CreateIdentityProviderConfigParams) => ({
    identityProviderConfig: params.identityProviderConfig,
  }),
});
