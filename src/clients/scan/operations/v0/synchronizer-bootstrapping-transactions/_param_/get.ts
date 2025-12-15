import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetSynchronizerBootstrappingTransactions = createApiOperation<paths['/v0/synchronizer-bootstrapping-transactions/{domain_id_prefix}']['get']['parameters']['path'], paths['/v0/synchronizer-bootstrapping-transactions/{domain_id_prefix}']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    domain_id_prefix: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/synchronizer-bootstrapping-transactions/${params.domain_id_prefix}`;
    return url;
  },
});
