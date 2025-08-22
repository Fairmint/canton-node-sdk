import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { RevokeUserRightsParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/users/{user-id}/rights' as const;

// The params type should include both path parameters and request body
export type RevokeUserRightsParams = z.infer<typeof RevokeUserRightsParamsSchema>;

export type RevokeUserRightsResponse = paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const RevokeUserRights = createApiOperation<RevokeUserRightsParams, RevokeUserRightsResponse>({
  paramsSchema: RevokeUserRightsParamsSchema,
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/rights`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
}); 