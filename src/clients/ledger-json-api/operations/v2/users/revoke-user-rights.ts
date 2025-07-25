import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/users/{user-id}/rights' as const;

// The params type should include both path parameters and request body
export type RevokeUserRightsParams = {
  userId: string; // Path parameter
} & paths[typeof endpoint]['patch']['requestBody']['content']['application/json'];

export type RevokeUserRightsResponse = paths[typeof endpoint]['patch']['responses']['200']['content']['application/json'];

export const RevokeUserRights = createApiOperation<RevokeUserRightsParams, RevokeUserRightsResponse>({
  paramsSchema: z.any(),
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/users/${params.userId}/rights`,
  buildRequestData: (params) => {
    const { userId, ...requestBody } = params;
    return requestBody;
  },
}); 