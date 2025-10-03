import { createApiOperation } from '../../../../../core';
import { type DeleteIdentityProviderConfigResponse } from '../../../schemas/api';
import {
  DeleteIdentityProviderConfigParamsSchema,
  type DeleteIdentityProviderConfigParams,
} from '../../../schemas/operations';

/**
 * Delete identity provider config
 *
 * @example
 *   ```typescript
 *   await client.deleteIdentityProviderConfig({ idpId: 'my-idp' });
 *   ```;
 */
export const DeleteIdentityProviderConfig = createApiOperation<
  DeleteIdentityProviderConfigParams,
  DeleteIdentityProviderConfigResponse
>({
  paramsSchema: DeleteIdentityProviderConfigParamsSchema,
  method: 'DELETE',
  buildUrl: (params: DeleteIdentityProviderConfigParams, apiUrl: string) => `${apiUrl}/v2/idps/${params.idpId}`,
});
