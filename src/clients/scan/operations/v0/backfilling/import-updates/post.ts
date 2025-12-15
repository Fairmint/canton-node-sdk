/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetImportUpdatesParams {
  body: any;
}

export const GetImportUpdates = createApiOperation<GetImportUpdatesParams, paths['/v0/backfilling/import-updates']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/backfilling/import-updates`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
