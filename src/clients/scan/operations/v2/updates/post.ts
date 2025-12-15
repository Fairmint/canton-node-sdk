import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetUpdateHistoryV2 = createApiOperation<{ body: paths['/v2/updates']['post']['requestBody']['content']['application/json'] }, paths['/v2/updates']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v2/updates`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
