/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetValidatorFaucetsByValidatorParams {
  validator_ids?: any;
}

export const GetValidatorFaucetsByValidator = createApiOperation<GetValidatorFaucetsByValidatorParams, paths['/v0/validators/validator-faucets']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/validators/validator-faucets`;
    const queryParams = new URLSearchParams();
    if (params['validator_ids'] !== undefined) queryParams.append('validator_ids', String(params['validator_ids']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
