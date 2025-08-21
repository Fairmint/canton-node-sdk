import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/commands/submit-and-wait-for-transaction' as const;

// Base type from OpenAPI
type BaseSubmitAndWaitForTransactionParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];

// Extended type with optional commandId and actAs
export type SubmitAndWaitForTransactionParams = Omit<BaseSubmitAndWaitForTransactionParams, 'commands'> & {
  commands: Omit<BaseSubmitAndWaitForTransactionParams['commands'], 'commandId' | 'actAs'> & {
    commandId?: string;
    actAs?: string[];
  };
};

export type SubmitAndWaitForTransactionResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransaction = createApiOperation<SubmitAndWaitForTransactionParams, SubmitAndWaitForTransactionResponse>({
  paramsSchema: z.any(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => {
    return {
      commands: {
        ...params.commands,
        commandId: params.commands.commandId || `submit-and-wait-for-transaction-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        actAs: params.commands.actAs || [client.getPartyId()],
      },
      transactionFormat: params.transactionFormat,
    };
  },
}); 