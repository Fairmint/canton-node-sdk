import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { SubmitAndWaitParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/commands/submit-and-wait' as const;

// Base type from OpenAPI
// type BaseSubmitAndWaitParams = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];

// Extended type with optional commandId and actAs
export type SubmitAndWaitParams = z.infer<typeof SubmitAndWaitParamsSchema>;

export type SubmitAndWaitResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWait = createApiOperation<SubmitAndWaitParams, SubmitAndWaitResponse>({
  paramsSchema: SubmitAndWaitParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
    ...params,
    commandId: params.commandId || `submit-and-wait-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    actAs: params.actAs || [client.getPartyId()],
  }),
});
