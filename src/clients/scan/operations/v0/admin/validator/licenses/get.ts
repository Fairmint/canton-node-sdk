import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const ListValidatorLicenses = createApiOperation<paths['/v0/admin/validator/licenses']['get']['parameters']['query'], paths['/v0/admin/validator/licenses']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    after: z.number().optional(),
    limit: z.number().optional()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/admin/validator/licenses`;
    const queryParams = new URLSearchParams();
    if (params['after'] !== undefined) {
      const val = params['after'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('after', String(v)));
      } else {
        queryParams.append('after', String(val));
      }
    }
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
