/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetUpdateHistoryParams {
  body: any;
}

export const GetUpdateHistory = createApiOperation<GetUpdateHistoryParams, paths['/v0/updates']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/updates`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
