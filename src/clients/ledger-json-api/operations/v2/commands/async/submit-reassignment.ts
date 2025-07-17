import { createApiOperation } from '../../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../../generated/openapi-types';

const endpoint = '/v2/commands/async/submit-reassignment';

export const AsyncSubmitReassignmentParamsSchema = z.object({
  reassignmentCommands: z.any(),
});

export type AsyncSubmitReassignmentParams = z.infer<typeof AsyncSubmitReassignmentParamsSchema>;
export type AsyncSubmitReassignmentRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type AsyncSubmitReassignmentResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const AsyncSubmitReassignment = createApiOperation<
  AsyncSubmitReassignmentParams,
  AsyncSubmitReassignmentResponse
>({
  paramsSchema: AsyncSubmitReassignmentParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params): AsyncSubmitReassignmentRequest => {
    return {
      reassignmentCommands: params.reassignmentCommands,
    };
  },
}); 