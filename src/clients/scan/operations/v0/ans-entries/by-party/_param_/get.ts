/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface LookupAnsEntryByPartyParams {
  party: string;
}

export const LookupAnsEntryByParty = createApiOperation<LookupAnsEntryByPartyParams, paths['/v0/ans-entries/by-party/{party}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/ans-entries/by-party/${params.party}`;
    return url;
  },
});
