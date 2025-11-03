import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GrantUserRightsParamsSchema } from '../../../schemas/operations';

type Endpoint = '/v2/users/{user-id}/rights';

// The params type should include both path parameters and request body
export type GrantUserRightsParams = z.infer<typeof GrantUserRightsParamsSchema>;

export type GrantUserRightsResponse = paths[Endpoint]['post']['responses']['200']['content']['application/json'];

export const GrantUserRights = createApiOperation<GrantUserRightsParams, GrantUserRightsResponse>({
  paramsSchema: GrantUserRightsParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/rights`,
  buildRequestData: (params) => 
    // Canton API expects userId in both the URL path AND the request body
    // Always inject empty string for identityProviderId
     ({
      ...params,
      identityProviderId: '',
    })
  ,
});
