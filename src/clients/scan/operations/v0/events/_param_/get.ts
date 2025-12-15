/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetEventByIdParams {
  update_id: string;
  daml_value_encoding?: any;
}

export const GetEventById = createApiOperation<GetEventByIdParams, paths['/v0/events/{update_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/events/${params.update_id}`;
    const queryParams = new URLSearchParams();
    if (params['daml_value_encoding'] !== undefined) queryParams.append('daml_value_encoding', String(params['daml_value_encoding']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
