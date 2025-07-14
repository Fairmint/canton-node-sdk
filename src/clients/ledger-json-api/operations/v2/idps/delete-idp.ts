import { createApiOperation } from '../../../../../core';
import { DeleteIdentityProviderConfigParamsSchema, DeleteIdentityProviderConfigParams } from '../../../schemas/operations';
import { DeleteIdentityProviderConfigResponse } from '../../../schemas/api';

/**
 * @description Delete identity provider config
 * @example
 * ```typescript
 * await client.deleteIdentityProviderConfig({ idpId: 'my-idp' });
 * ```
 */
export const DeleteIdentityProviderConfig = createApiOperation<
  DeleteIdentityProviderConfigParams,
  DeleteIdentityProviderConfigResponse
>({
  paramsSchema: DeleteIdentityProviderConfigParamsSchema,
  method: 'DELETE',
  buildUrl: (params: DeleteIdentityProviderConfigParams, apiUrl: string) => `${apiUrl}/v2/idps/${params.idpId}`,
}); 