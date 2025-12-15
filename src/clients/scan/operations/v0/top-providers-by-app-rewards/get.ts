/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetTopProvidersByAppRewardsParams {
  round?: any;
  limit?: any;
}

export const GetTopProvidersByAppRewards = createApiOperation<GetTopProvidersByAppRewardsParams, paths['/v0/top-providers-by-app-rewards']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/top-providers-by-app-rewards`;
    const queryParams = new URLSearchParams();
    if (params['round'] !== undefined) queryParams.append('round', String(params['round']));
    if (params['limit'] !== undefined) queryParams.append('limit', String(params['limit']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
