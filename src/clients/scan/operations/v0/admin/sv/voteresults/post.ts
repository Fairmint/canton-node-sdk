import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const ListVoteRequestResults = createApiOperation<{ body: paths['/v0/admin/sv/voteresults']['post']['requestBody']['content']['application/json'] }, paths['/v0/admin/sv/voteresults']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/admin/sv/voteresults`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
