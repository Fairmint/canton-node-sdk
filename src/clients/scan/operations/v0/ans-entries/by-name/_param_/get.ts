import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const LookupAnsEntryByName = createApiOperation<paths['/v0/ans-entries/by-name/{name}']['get']['parameters']['path'], paths['/v0/ans-entries/by-name/{name}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    name: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/ans-entries/by-name/${params.name}`;
    return url;
  },
});
