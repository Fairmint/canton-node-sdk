import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

type Endpoint = '/v2/users/{user-id}/rights';

export const ListUserRightsParamsSchema = z.object({
  userId: z.string(),
});

export type ListUserRightsParams = z.infer<typeof ListUserRightsParamsSchema>;
export type ListUserRightsResponse = paths[Endpoint]['get']['responses']['200']['content']['application/json'];

export const ListUserRights = createApiOperation<ListUserRightsParams, ListUserRightsResponse>({
  paramsSchema: ListUserRightsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users/${params.userId}/rights`;
    const queryParams = new URLSearchParams();
    // Always pass empty string for identity-provider-id
    queryParams.append('identity-provider-id', '');
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
