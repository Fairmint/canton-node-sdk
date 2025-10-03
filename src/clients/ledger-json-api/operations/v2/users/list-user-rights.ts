import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/users/{user-id}/rights';

export const ListUserRightsParamsSchema = z.object({
  userId: z.string(),
  identityProviderId: z.string().optional(),
});

export type ListUserRightsParams = z.infer<typeof ListUserRightsParamsSchema>;
export type ListUserRightsResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

export const ListUserRights = createApiOperation<ListUserRightsParams, ListUserRightsResponse>({
  paramsSchema: ListUserRightsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users/${params.userId}/rights`;
    const queryParams = new URLSearchParams();
    if (params.identityProviderId) {
      queryParams.append('identity-provider-id', params.identityProviderId);
    }
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
