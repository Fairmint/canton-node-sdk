import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const LookupTransferCommandCounterByParty = createApiOperation<paths['/v0/transfer-command-counter/{party}']['get']['parameters']['path'], paths['/v0/transfer-command-counter/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    party: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transfer-command-counter/${params.party}`;
    return url;
  },
});
