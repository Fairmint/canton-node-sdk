/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetTopValidatorsByValidatorFaucetsParams {
  limit?: any;
}

export const GetTopValidatorsByValidatorFaucets = createApiOperation<GetTopValidatorsByValidatorFaucetsParams, paths['/v0/top-validators-by-validator-faucets']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/top-validators-by-validator-faucets`;
    const queryParams = new URLSearchParams();
    if (params['limit'] !== undefined) queryParams.append('limit', String(params['limit']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
