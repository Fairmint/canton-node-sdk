/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetOpenAndIssuingMiningRoundsParams {
  body: any;
}

export const GetOpenAndIssuingMiningRounds = createApiOperation<GetOpenAndIssuingMiningRoundsParams, paths['/v0/open-and-issuing-mining-rounds']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/open-and-issuing-mining-rounds`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
