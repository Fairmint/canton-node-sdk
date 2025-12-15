/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListActivityParams {
  body: any;
}

export const ListActivity = createApiOperation<ListActivityParams, paths['/v0/activities']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/activities`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
