import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetAmuletConfigForRound = createApiOperation<paths['/v0/amulet-config-for-round']['get']['parameters']['query'], paths['/v0/amulet-config-for-round']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    round: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/amulet-config-for-round`;
    const queryParams = new URLSearchParams();
    if (params['round'] !== undefined) {
      const val = params['round'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('round', String(v)));
      } else {
        queryParams.append('round', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
