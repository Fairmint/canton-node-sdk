import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const ForceAcsSnapshotNow = createApiOperation<void, paths['/v0/state/acs/force']['post']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({}),
  method: 'POST',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/state/acs/force`;
    return url;
  },
});
