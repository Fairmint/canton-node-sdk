import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/commands/submit-and-wait-for-transaction-tree' as const;

// Base type from OpenAPI
type BaseSubmitAndWaitForTransactionTreeParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];

// Extended type with optional commandId and actAs
export type SubmitAndWaitForTransactionTreeParams = Omit<BaseSubmitAndWaitForTransactionTreeParams, 'commandId' | 'actAs'> & {
  commandId?: string;
  actAs?: string[];
};

export type SubmitAndWaitForTransactionTreeResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransactionTree = createApiOperation<SubmitAndWaitForTransactionTreeParams, SubmitAndWaitForTransactionTreeResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => {
    return {
      ...params,
      commandId: params.commandId || `submit-and-wait-for-transaction-tree-${Date.now()}`,
      actAs: params.actAs || [client.getPartyId()],
    };
  },
}); 