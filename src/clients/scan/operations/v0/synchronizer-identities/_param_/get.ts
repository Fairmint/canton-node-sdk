/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export interface GetSynchronizerIdentitiesParams {
  domain_id_prefix: string;
}

export const GetSynchronizerIdentities = createApiOperation<GetSynchronizerIdentitiesParams, paths['/v0/synchronizer-identities/{domain_id_prefix}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/synchronizer-identities/${params.domain_id_prefix}`;
    return url;
  },
});
