/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListTransactionHistoryParams {
  body: any;
}

export const ListTransactionHistory = createApiOperation<ListTransactionHistoryParams, paths['/v0/transactions']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transactions`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
