/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetTotalAmuletBalanceParams {
  asOfEndOfRound?: any;
}

export const GetTotalAmuletBalance = createApiOperation<GetTotalAmuletBalanceParams, paths['/v0/total-amulet-balance']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/total-amulet-balance`;
    const queryParams = new URLSearchParams();
    if (params['asOfEndOfRound'] !== undefined) queryParams.append('asOfEndOfRound', String(params['asOfEndOfRound']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
