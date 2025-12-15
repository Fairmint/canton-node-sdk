import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const LookupTransferCommandStatus = createApiOperation<paths['/v0/transfer-command/status']['get']['parameters']['query'], paths['/v0/transfer-command/status']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    sender: z.string(),
    nonce: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/transfer-command/status`;
    const queryParams = new URLSearchParams();
    if (params['sender'] !== undefined) {
      const val = params['sender'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('sender', String(v)));
      } else {
        queryParams.append('sender', String(val));
      }
    }
    if (params['nonce'] !== undefined) {
      const val = params['nonce'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('nonce', String(v)));
      } else {
        queryParams.append('nonce', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
