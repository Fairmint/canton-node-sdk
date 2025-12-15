/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListVoteRequestsByTrackingCidParams {
  body: any;
}

export const ListVoteRequestsByTrackingCid = createApiOperation<ListVoteRequestsByTrackingCidParams, paths['/v0/voterequest']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/voterequest`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
