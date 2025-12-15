/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetUpdateHistoryV2Params {
  body: any;
}

export const GetUpdateHistoryV2 = createApiOperation<GetUpdateHistoryV2Params, paths['/v2/updates']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v2/updates`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
