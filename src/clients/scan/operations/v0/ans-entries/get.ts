/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type paths } from '../../../../../generated/scan';

export interface ListAnsEntriesParams {
  name_prefix?: any;
  page_size?: any;
}

export const ListAnsEntries = createApiOperation<ListAnsEntriesParams, paths['/v0/ans-entries']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/ans-entries`;
    const queryParams = new URLSearchParams();
    if (params['name_prefix'] !== undefined) queryParams.append('name_prefix', String(params['name_prefix']));
    if (params['page_size'] !== undefined) queryParams.append('page_size', String(params['page_size']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
