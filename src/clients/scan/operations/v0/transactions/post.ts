import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const ListTransactionHistory = createApiOperation<{ body: paths['/v0/transactions']['post']['requestBody']['content']['application/json'] }, paths['/v0/transactions']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transactions`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
