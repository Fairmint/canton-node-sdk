import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetAmuletRules = createApiOperation<{ body: paths['/v0/amulet-rules']['post']['requestBody']['content']['application/json'] }, paths['/v0/amulet-rules']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/amulet-rules`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
