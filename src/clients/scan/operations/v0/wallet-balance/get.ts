/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface GetWalletBalanceParams {
  party_id?: any;
  asOfEndOfRound?: any;
}

export const GetWalletBalance = createApiOperation<GetWalletBalanceParams, paths['/v0/wallet-balance']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/wallet-balance`;
    const queryParams = new URLSearchParams();
    if (params['party_id'] !== undefined) queryParams.append('party_id', String(params['party_id']));
    if (params['asOfEndOfRound'] !== undefined) queryParams.append('asOfEndOfRound', String(params['asOfEndOfRound']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
