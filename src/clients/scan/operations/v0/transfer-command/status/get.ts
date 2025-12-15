/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface LookupTransferCommandStatusParams {
  sender?: any;
  nonce?: any;
}

export const LookupTransferCommandStatus = createApiOperation<LookupTransferCommandStatusParams, paths['/v0/transfer-command/status']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/transfer-command/status`;
    const queryParams = new URLSearchParams();
    if (params['sender'] !== undefined) queryParams.append('sender', String(params['sender']));
    if (params['nonce'] !== undefined) queryParams.append('nonce', String(params['nonce']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
