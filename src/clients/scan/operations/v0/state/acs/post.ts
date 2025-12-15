/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetAcsSnapshotAtParams {
  body: any;
}

export const GetAcsSnapshotAt = createApiOperation<GetAcsSnapshotAtParams, paths['/v0/state/acs']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/state/acs`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
