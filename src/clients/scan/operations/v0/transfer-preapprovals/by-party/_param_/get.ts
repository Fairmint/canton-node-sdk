/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface LookupTransferPreapprovalByPartyParams {
  party: string;
}

export const LookupTransferPreapprovalByParty = createApiOperation<LookupTransferPreapprovalByPartyParams, paths['/v0/transfer-preapprovals/by-party/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transfer-preapprovals/by-party/${params.party}`;
    return url;
  },
});
