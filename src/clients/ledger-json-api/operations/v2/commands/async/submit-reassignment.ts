import { z } from 'zod';
import { createApiOperation } from '../../../../../../core';
import type { paths } from '../../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { ReassignmentCommandsSchema } from '../../../../schemas/api/reassignment';

const endpoint = '/v2/commands/async/submit-reassignment';

export const AsyncSubmitReassignmentParamsSchema = z.object({
  reassignmentCommands: ReassignmentCommandsSchema,
});

export type AsyncSubmitReassignmentParams = z.infer<typeof AsyncSubmitReassignmentParamsSchema>;
export type AsyncSubmitReassignmentRequest =
  paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type AsyncSubmitReassignmentResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const AsyncSubmitReassignment = createApiOperation<
  AsyncSubmitReassignmentParams,
  AsyncSubmitReassignmentResponse
>({
  paramsSchema: AsyncSubmitReassignmentParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => ({
    reassignmentCommands: params.reassignmentCommands,
  }),
});
