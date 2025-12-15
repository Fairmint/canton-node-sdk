import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const LookupTransferPreapprovalByParty = createApiOperation<paths['/v0/transfer-preapprovals/by-party/{party}']['get']['parameters']['path'], paths['/v0/transfer-preapprovals/by-party/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    party: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transfer-preapprovals/by-party/${params.party}`;
    return url;
  },
});
