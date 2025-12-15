import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetValidatorFaucetsByValidator = createApiOperation<paths['/v0/validators/validator-faucets']['get']['parameters']['query'], paths['/v0/validators/validator-faucets']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    validator_ids: z.array(z.string())
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/validators/validator-faucets`;
    const queryParams = new URLSearchParams();
    if (params['validator_ids'] !== undefined) {
      const val = params['validator_ids'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('validator_ids', String(v)));
      } else {
        queryParams.append('validator_ids', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
