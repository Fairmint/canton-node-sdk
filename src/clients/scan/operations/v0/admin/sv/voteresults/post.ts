/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface ListVoteRequestResultsParams {
  body: any;
}

export const ListVoteRequestResults = createApiOperation<ListVoteRequestResultsParams, paths['/v0/admin/sv/voteresults']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/admin/sv/voteresults`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
