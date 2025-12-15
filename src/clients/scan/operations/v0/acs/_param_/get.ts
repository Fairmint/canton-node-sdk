/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetAcsSnapshotParams {
  party: string;
  record_time?: any;
}

export const GetAcsSnapshot = createApiOperation<GetAcsSnapshotParams, paths['/v0/acs/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/acs/${params.party}`;
    const queryParams = new URLSearchParams();
    if (params['record_time'] !== undefined) queryParams.append('record_time', String(params['record_time']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
