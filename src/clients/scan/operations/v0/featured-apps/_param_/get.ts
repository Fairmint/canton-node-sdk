import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const LookupFeaturedAppRight = createApiOperation<paths['/v0/featured-apps/{provider_party_id}']['get']['parameters']['path'], paths['/v0/featured-apps/{provider_party_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    provider_party_id: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/featured-apps/${params.provider_party_id}`;
    return url;
  },
});
