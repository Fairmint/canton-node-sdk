/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetEventHistoryParams {
  body: any;
}

export const GetEventHistory = createApiOperation<GetEventHistoryParams, paths['/v0/events']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/events`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
