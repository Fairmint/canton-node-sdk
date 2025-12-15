import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetUpdatesBefore = createApiOperation<{ body: paths['/v0/backfilling/updates-before']['post']['requestBody']['content']['application/json'] }, paths['/v0/backfilling/updates-before']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/backfilling/updates-before`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
