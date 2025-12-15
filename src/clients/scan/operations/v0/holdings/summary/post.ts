/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetHoldingsSummaryAtParams {
  body: any;
}

export const GetHoldingsSummaryAt = createApiOperation<GetHoldingsSummaryAtParams, paths['/v0/holdings/summary']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/holdings/summary`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
