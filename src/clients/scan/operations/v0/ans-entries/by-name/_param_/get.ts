/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface LookupAnsEntryByNameParams {
  name: string;
}

export const LookupAnsEntryByName = createApiOperation<LookupAnsEntryByNameParams, paths['/v0/ans-entries/by-name/{name}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/ans-entries/by-name/${params.name}`;
    return url;
  },
});
