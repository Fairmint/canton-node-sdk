import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/commands/submit-and-wait-for-transaction' as const;

export type SubmitAndWaitForTransactionParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type SubmitAndWaitForTransactionResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransaction = createApiOperation<SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
}); 