/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface LookupFeaturedAppRightParams {
  provider_party_id: string;
}

export const LookupFeaturedAppRight = createApiOperation<LookupFeaturedAppRightParams, paths['/v0/featured-apps/{provider_party_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/featured-apps/${params.provider_party_id}`;
    return url;
  },
});
