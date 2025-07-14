import { createApiOperation } from '../../../../../../core';
import { AsyncSubmitReassignmentParamsSchema, AsyncSubmitReassignmentParams } from '../../../../schemas/operations';
import { SubmitReassignmentResponse } from '../../../../schemas/api';

/**
 * @description Submit reassignment command asynchronously
 * @example
 * ```typescript
 * const result = await client.asyncSubmitReassignment({
 *   reassignmentCommands: {
 *     commandId: 'unique-command-id',
 *     submitter: 'party1',
 *     commands: [assignCommand, unassignCommand]
 *   }
 * });
 * ```
 * @param reassignmentCommands - Reassignment commands to submit
 */
export const AsyncSubmitReassignment = createApiOperation<
  AsyncSubmitReassignmentParams,
  SubmitReassignmentResponse
>({
  paramsSchema: AsyncSubmitReassignmentParamsSchema,
  method: 'POST',
  buildUrl: (_params: AsyncSubmitReassignmentParams, apiUrl: string) => `${apiUrl}/v2/commands/async/submit-reassignment`,
  buildRequestData: (params: AsyncSubmitReassignmentParams) => {
    return {
      reassignmentCommands: params.reassignmentCommands,
    };
  },
}); 