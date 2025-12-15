import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const LookupAnsEntryByParty = createApiOperation<paths['/v0/ans-entries/by-party/{party}']['get']['parameters']['path'], paths['/v0/ans-entries/by-party/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    party: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/ans-entries/by-party/${params.party}`;
    return url;
  },
});
