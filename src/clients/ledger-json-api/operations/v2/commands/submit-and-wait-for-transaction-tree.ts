import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/commands/submit-and-wait-for-transaction-tree' as const;

export type SubmitAndWaitForTransactionTreeParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type SubmitAndWaitForTransactionTreeResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransactionTree = createApiOperation<SubmitAndWaitForTransactionTreeParams, SubmitAndWaitForTransactionTreeResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 