import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/state/active-contracts' as const;

export type GetActiveContractsParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetActiveContractsResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const GetActiveContracts = createApiOperation<GetActiveContractsParams, GetActiveContractsResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 