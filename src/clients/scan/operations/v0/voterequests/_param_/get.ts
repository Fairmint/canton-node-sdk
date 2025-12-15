/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface LookupDsoRulesVoteRequestParams {
  vote_request_contract_id: string;
}

export const LookupDsoRulesVoteRequest = createApiOperation<LookupDsoRulesVoteRequestParams, paths['/v0/voterequests/{vote_request_contract_id}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/voterequests/${params.vote_request_contract_id}`;
    return url;
  },
});
