import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/update-by-offset' as const;

export type GetUpdateByOffsetParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetUpdateByOffsetResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetUpdateByOffset = createApiOperation<GetUpdateByOffsetParams, GetUpdateByOffsetResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 