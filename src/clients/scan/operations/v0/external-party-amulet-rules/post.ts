/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetExternalPartyAmuletRulesParams {
  body: any;
}

export const GetExternalPartyAmuletRules = createApiOperation<GetExternalPartyAmuletRulesParams, paths['/v0/external-party-amulet-rules']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/external-party-amulet-rules`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
