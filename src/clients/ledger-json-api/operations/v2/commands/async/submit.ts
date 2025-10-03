import { createApiOperation } from '../../../../../../core';
import { type z } from 'zod';
import type { paths } from '../../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { AsyncSubmitParamsSchema } from '../../../../schemas/operations';

const endpoint = '/v2/commands/async/submit' as const;

// Base type from OpenAPI
// type BaseAsyncSubmitParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];

// Extended type with optional commandId and actAs
export type AsyncSubmitParams = z.infer<typeof AsyncSubmitParamsSchema>;

export type AsyncSubmitResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const AsyncSubmit = createApiOperation<AsyncSubmitParams, AsyncSubmitResponse>({
  paramsSchema: AsyncSubmitParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
      ...params,
      commandId: params.commandId || `async-submit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      actAs: params.actAs || [client.getPartyId()],
    }),
}); 