import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { SubmitAndWaitForTransactionTreeParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/commands/submit-and-wait-for-transaction-tree' as const;

// Extended type with optional commandId and actAs
export type SubmitAndWaitForTransactionTreeParams = z.infer<typeof SubmitAndWaitForTransactionTreeParamsSchema>;

export type SubmitAndWaitForTransactionTreeResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransactionTree = createApiOperation<
  SubmitAndWaitForTransactionTreeParams,
  SubmitAndWaitForTransactionTreeResponse
>({
  paramsSchema: SubmitAndWaitForTransactionTreeParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
    ...params,
    commandId:
      params.commandId ??
      `submit-and-wait-for-transaction-tree-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    actAs: params.actAs ?? [client.getPartyId()],
  }),
});
