/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface LookupTransferCommandCounterByPartyParams {
  party: string;
}

export const LookupTransferCommandCounterByParty = createApiOperation<LookupTransferCommandCounterByPartyParams, paths['/v0/transfer-command-counter/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/transfer-command-counter/${params.party}`;
    return url;
  },
});
