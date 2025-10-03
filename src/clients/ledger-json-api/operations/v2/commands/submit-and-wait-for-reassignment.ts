import { createApiOperation } from '../../../../../core';
import { SubmitAndWaitForReassignmentParamsSchema, type SubmitAndWaitForReassignmentParams } from '../../../schemas/operations';
import { type JsSubmitAndWaitForReassignmentResponse } from '../../../schemas/api';

/**
 * @description Submit a batch of reassignment commands and wait for the reassignment response
 * @example
 * ```typescript
 * const result = await client.submitAndWaitForReassignment({
 *   reassignmentCommands: {
 *     commandId: 'unique-command-id',
 *     submitter: 'party1',
 *     commands: [assignCommand, unassignCommand]
 *   }
 * });
 * ```
 * @param reassignmentCommands - Reassignment commands to submit
 * @param eventFormat - Event format (optional)
 */
export const SubmitAndWaitForReassignment = createApiOperation<
  SubmitAndWaitForReassignmentParams,
  JsSubmitAndWaitForReassignmentResponse
>({
  paramsSchema: SubmitAndWaitForReassignmentParamsSchema,
  method: 'POST',
  buildUrl: (_params: SubmitAndWaitForReassignmentParams, apiUrl: string) => `${apiUrl}/v2/commands/submit-and-wait-for-reassignment`,
  buildRequestData: (params: SubmitAndWaitForReassignmentParams) => ({
      reassignmentCommands: params.reassignmentCommands,
      eventFormat: params.eventFormat,
    }),
}); 