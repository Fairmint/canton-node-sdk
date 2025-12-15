/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetRoundOfLatestDataParams {}

export const GetRoundOfLatestData = createApiOperation<void, paths['/v0/round-of-latest-data']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/round-of-latest-data`;
    return url;
  },
});
