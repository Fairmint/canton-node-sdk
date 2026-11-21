import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

type Endpoint = '/v2/users/{user-id}/rights';

export const ListUserRightsParamsSchema = z.object({
  userId: z.string(),
  /** The user's identity provider; omitted or empty: the default identity provider. */
  identityProviderId: z.string().optional(),
});

export type ListUserRightsParams = z.infer<typeof ListUserRightsParamsSchema>;
export type ListUserRightsResponse = paths[Endpoint]['get']['responses']['200']['content']['application/json'];

export const ListUserRights = createApiOperation<ListUserRightsParams, ListUserRightsResponse>({
  paramsSchema: ListUserRightsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const baseUrl = `${apiUrl}/v2/users/${encodeURIComponent(params.userId)}/rights`;
    const queryParams = new URLSearchParams();
    // Empty string: the default identity provider.
    queryParams.append('identity-provider-id', params.identityProviderId ?? '');
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
});
