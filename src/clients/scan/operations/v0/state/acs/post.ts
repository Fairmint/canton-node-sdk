import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import { type paths } from '../../../../../../generated/scan';

export const GetAcsSnapshotAt = createApiOperation<{ body: paths['/v0/state/acs']['post']['requestBody']['content']['application/json'] }, paths['/v0/state/acs']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    body: z.unknown()
  }),
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/state/acs`;
    return url;
  },
  buildRequestData: (params) => params.body,
});
