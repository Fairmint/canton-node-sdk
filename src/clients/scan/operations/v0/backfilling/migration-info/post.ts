/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetMigrationInfoParams {
  body: any;
}

export const GetMigrationInfo = createApiOperation<GetMigrationInfoParams, paths['/v0/backfilling/migration-info']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/backfilling/migration-info`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
