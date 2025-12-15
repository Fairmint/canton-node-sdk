/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export interface ListValidatorLicensesParams {
  after?: any;
  limit?: any;
}

export const ListValidatorLicenses = createApiOperation<ListValidatorLicensesParams, paths['/v0/admin/validator/licenses']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    let url = `${apiUrl}/v0/admin/validator/licenses`;
    const queryParams = new URLSearchParams();
    if (params['after'] !== undefined) queryParams.append('after', String(params['after']));
    if (params['limit'] !== undefined) queryParams.append('limit', String(params['limit']));
    if (Array.from(queryParams).length > 0) url += `?${queryParams.toString()}`;
    return url;
  },
});
