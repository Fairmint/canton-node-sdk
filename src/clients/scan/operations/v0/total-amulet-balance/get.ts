import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetTotalAmuletBalance = createApiOperation<paths['/v0/total-amulet-balance']['get']['parameters']['query'], paths['/v0/total-amulet-balance']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    asOfEndOfRound: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/total-amulet-balance`;
    const queryParams = new URLSearchParams();
    if (params['asOfEndOfRound'] !== undefined) {
      const val = params['asOfEndOfRound'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('asOfEndOfRound', String(v)));
      } else {
        queryParams.append('asOfEndOfRound', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
