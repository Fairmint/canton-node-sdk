import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export const GetWalletBalance = createApiOperation<paths['/v0/wallet-balance']['get']['parameters']['query'], paths['/v0/wallet-balance']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    party_id: z.string(),
    asOfEndOfRound: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/wallet-balance`;
    const queryParams = new URLSearchParams();
    if (params['party_id'] !== undefined) {
      const val = params['party_id'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('party_id', String(v)));
      } else {
        queryParams.append('party_id', String(val));
      }
    }
    if (params['asOfEndOfRound'] !== undefined) {
      const val = params['asOfEndOfRound'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('asOfEndOfRound', String(v)));
      } else {
        queryParams.append('asOfEndOfRound', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
