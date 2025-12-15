/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetUpdateByIdParams {
  update_id: string;
  lossless?: any;
}

export const GetUpdateById = createApiOperation<GetUpdateByIdParams, paths['/v0/updates/{update_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/updates/${params.update_id}`;
    const queryParams = new URLSearchParams();
    if (params['lossless'] !== undefined) queryParams.append('lossless', String(params['lossless']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
