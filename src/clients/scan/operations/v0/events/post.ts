import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetEventHistory = createApiOperation<{ body: paths['/v0/events']['post']['requestBody']['content']['application/json'] }, paths['/v0/events']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/events`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
