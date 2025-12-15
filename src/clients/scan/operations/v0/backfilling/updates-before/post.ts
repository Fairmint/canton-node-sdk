/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetUpdatesBeforeParams {
  body: any;
}

export const GetUpdatesBefore = createApiOperation<GetUpdatesBeforeParams, paths['/v0/backfilling/updates-before']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/backfilling/updates-before`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
