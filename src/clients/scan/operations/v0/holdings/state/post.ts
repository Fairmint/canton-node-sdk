/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetHoldingsStateAtParams {
  body: any;
}

export const GetHoldingsStateAt = createApiOperation<GetHoldingsStateAtParams, paths['/v0/holdings/state']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/holdings/state`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
