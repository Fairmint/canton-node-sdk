import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetUpdateByIdV1 = createApiOperation<paths['/v1/updates/{update_id}']['get']['parameters']['path'] & paths['/v1/updates/{update_id}']['get']['parameters']['query'], paths['/v1/updates/{update_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    update_id: z.string(),
    daml_value_encoding: z.unknown().optional()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v1/updates/${params.update_id}`;
    const queryParams = new URLSearchParams();
    if (params['daml_value_encoding'] !== undefined) {
      const val = params['daml_value_encoding'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('daml_value_encoding', String(v)));
      } else {
        queryParams.append('daml_value_encoding', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
