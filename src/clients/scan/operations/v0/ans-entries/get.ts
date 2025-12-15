import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const ListAnsEntries = createApiOperation<paths['/v0/ans-entries']['get']['parameters']['query'], paths['/v0/ans-entries']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    name_prefix: z.string().optional(),
    page_size: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/ans-entries`;
    const queryParams = new URLSearchParams();
    if (params['name_prefix'] !== undefined) {
      const val = params['name_prefix'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('name_prefix', String(v)));
      } else {
        queryParams.append('name_prefix', String(val));
      }
    }
    if (params['page_size'] !== undefined) {
      const val = params['page_size'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('page_size', String(v)));
      } else {
        queryParams.append('page_size', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
