import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetMigrationInfo = createApiOperation<{ body: paths['/v0/backfilling/migration-info']['post']['requestBody']['content']['application/json'] }, paths['/v0/backfilling/migration-info']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/backfilling/migration-info`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
