/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface ListAmuletPriceVotesParams {}

export const ListAmuletPriceVotes = createApiOperation<void, paths['/v0/amulet-price/votes']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/amulet-price/votes`;
    return url;
  },
});
