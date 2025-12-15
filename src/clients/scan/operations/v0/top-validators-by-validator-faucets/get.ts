import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetTopValidatorsByValidatorFaucets = createApiOperation<paths['/v0/top-validators-by-validator-faucets']['get']['parameters']['query'], paths['/v0/top-validators-by-validator-faucets']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    limit: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/top-validators-by-validator-faucets`;
    const queryParams = new URLSearchParams();
    if (params['limit'] !== undefined) {
      const val = params['limit'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('limit', String(v)));
      } else {
        queryParams.append('limit', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
