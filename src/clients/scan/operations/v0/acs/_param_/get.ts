import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetAcsSnapshot = createApiOperation<paths['/v0/acs/{party}']['get']['parameters']['path'] & paths['/v0/acs/{party}']['get']['parameters']['query'], paths['/v0/acs/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    party: z.string(),
    record_time: z.string().optional()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/acs/${params.party}`;
    const queryParams = new URLSearchParams();
    if (params['record_time'] !== undefined) {
      const val = params['record_time'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('record_time', String(v)));
      } else {
        queryParams.append('record_time', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
