/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListSvBftSequencersParams {}

export const ListSvBftSequencers = createApiOperation<void, paths['/v0/sv-bft-sequencers']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/sv-bft-sequencers`;
    return url;
  },
});
