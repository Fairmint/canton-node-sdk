/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetAnsRulesParams {
  body: any;
}

export const GetAnsRules = createApiOperation<GetAnsRulesParams, paths['/v0/ans-rules']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/ans-rules`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
