import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const GetDateOfMostRecentSnapshotBefore = createApiOperation<paths['/v0/state/acs/snapshot-timestamp']['get']['parameters']['query'], paths['/v0/state/acs/snapshot-timestamp']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    before: z.string(),
    migration_id: z.number()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/state/acs/snapshot-timestamp`;
    const queryParams = new URLSearchParams();
    if (params['before'] !== undefined) {
      const val = params['before'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('before', String(v)));
      } else {
        queryParams.append('before', String(val));
      }
    }
    if (params['migration_id'] !== undefined) {
      const val = params['migration_id'];
      if (Array.isArray(val)) {
        val.forEach((v: any) => queryParams.append('migration_id', String(v)));
      } else {
        queryParams.append('migration_id', String(val));
      }
    }
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
