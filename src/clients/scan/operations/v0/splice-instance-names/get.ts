/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetSpliceInstanceNamesParams {}

export const GetSpliceInstanceNames = createApiOperation<void, paths['/v0/splice-instance-names']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/splice-instance-names`;
    return url;
  },
});
