import { createApiOperation } from '../../../../../core';
import { type z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { SubmitAndWaitForTransactionParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/commands/submit-and-wait-for-transaction' as const;

// Base type from OpenAPI
// type BaseSubmitAndWaitForTransactionParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];

// Extended type with optional commandId and actAs
export type SubmitAndWaitForTransactionParams = z.infer<typeof SubmitAndWaitForTransactionParamsSchema>;

export type SubmitAndWaitForTransactionResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransaction = createApiOperation<SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionResponse>({
  paramsSchema: SubmitAndWaitForTransactionParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
      ...params,
      commandId: params.commandId || `submit-and-wait-for-transaction-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      actAs: params.actAs || [client.getPartyId()],
    }),
}); 