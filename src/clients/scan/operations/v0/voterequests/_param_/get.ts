import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const LookupDsoRulesVoteRequest = createApiOperation<paths['/v0/voterequests/{vote_request_contract_id}']['get']['parameters']['path'], paths['/v0/voterequests/{vote_request_contract_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    vote_request_contract_id: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/voterequests/${params.vote_request_contract_id}`;
    return url;
  },
});
