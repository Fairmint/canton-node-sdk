/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetAmuletConfigForRoundParams {
  round?: any;
}

export const GetAmuletConfigForRound = createApiOperation<GetAmuletConfigForRoundParams, paths['/v0/amulet-config-for-round']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/amulet-config-for-round`;
    const queryParams = new URLSearchParams();
    if (params['round'] !== undefined) queryParams.append('round', String(params['round']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
