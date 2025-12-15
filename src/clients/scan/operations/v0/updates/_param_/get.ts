import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetUpdateById = createApiOperation<paths['/v0/updates/{update_id}']['get']['parameters']['path'] & paths['/v0/updates/{update_id}']['get']['parameters']['query'], paths['/v0/updates/{update_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    update_id: z.string(),
    lossless: z.boolean().optional()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/updates/${params.update_id}`;
    const queryParams = new URLSearchParams();
    if (params['lossless'] !== undefined) {
      const val = params['lossless'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('lossless', String(v)));
      } else {
        queryParams.append('lossless', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
