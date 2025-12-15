/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetAggregatedRoundsParams {}

export const GetAggregatedRounds = createApiOperation<void, paths['/v0/aggregated-rounds']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/aggregated-rounds`;
    return url;
  },
});
