import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/update-by-id' as const;

export type GetUpdateByIdParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetUpdateByIdResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetUpdateById = createApiOperation<GetUpdateByIdParams, GetUpdateByIdResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 