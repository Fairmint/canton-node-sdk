/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListRoundPartyTotalsParams {
  body: any;
}

export const ListRoundPartyTotals = createApiOperation<ListRoundPartyTotalsParams, paths['/v0/round-party-totals']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/round-party-totals`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
