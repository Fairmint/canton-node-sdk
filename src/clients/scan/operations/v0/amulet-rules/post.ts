/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetAmuletRulesParams {
  body: any;
}

export const GetAmuletRules = createApiOperation<GetAmuletRulesParams, paths['/v0/amulet-rules']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/amulet-rules`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
