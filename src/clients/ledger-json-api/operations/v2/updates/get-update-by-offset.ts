import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetUpdateByOffsetParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/updates/update-by-offset' as const;

export type GetUpdateByOffsetParams = z.infer<typeof GetUpdateByOffsetParamsSchema>;
export type GetUpdateByOffsetResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetUpdateByOffset = createApiOperation<GetUpdateByOffsetParams, GetUpdateByOffsetResponse>({
  paramsSchema: GetUpdateByOffsetParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 