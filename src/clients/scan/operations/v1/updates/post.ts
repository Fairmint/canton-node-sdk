/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetUpdateHistoryV1Params {
  body: any;
}

export const GetUpdateHistoryV1 = createApiOperation<GetUpdateHistoryV1Params, paths['/v1/updates']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v1/updates`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
