/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface GetDateOfMostRecentSnapshotBeforeParams {
  before?: any;
  migration_id?: any;
}

export const GetDateOfMostRecentSnapshotBefore = createApiOperation<GetDateOfMostRecentSnapshotBeforeParams, paths['/v0/state/acs/snapshot-timestamp']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/state/acs/snapshot-timestamp`;
    const queryParams = new URLSearchParams();
    if (params['before'] !== undefined) queryParams.append('before', String(params['before']));
    if (params['migration_id'] !== undefined) queryParams.append('migration_id', String(params['migration_id']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
