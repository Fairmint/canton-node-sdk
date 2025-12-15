/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListRoundTotalsParams {
  body: any;
}

export const ListRoundTotals = createApiOperation<ListRoundTotalsParams, paths['/v0/round-totals']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/round-totals`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
