import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/commands/submit-and-wait-for-reassignment' as const;

// Custom params schema for user input
export const SubmitAndWaitForReassignmentParamsSchema = z.object({
  /** Reassignment commands to submit. */
  reassignmentCommands: z.object({
    /** Workflow ID (optional). */
    workflowId: z.string().min(1).optional(),
    /** User ID submitting the command (optional if using authentication). */
    userId: z.string().min(1).optional(),
    /** Unique identifier for the command. */
    commandId: z.string().min(1),
    /** Party submitting the command. */
    submitter: z.string().min(1),
    /** Submission ID (optional). */
    submissionId: z.string().min(1).optional(),
    /** Individual reassignment commands. */
    commands: z.array(z.any()),
  }),
  /** Event format (optional). */
  eventFormat: z.any().optional(),
});

export type SubmitAndWaitForReassignmentParams = z.infer<typeof SubmitAndWaitForReassignmentParamsSchema>;

// Network call types from auto-generated OpenAPI
export type SubmitAndWaitForReassignmentRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type SubmitAndWaitForReassignmentResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * @description Submit a batch of reassignment commands and wait for the reassignment response
 * @example
 * ```typescript
 * const result = await client.submitAndWaitForReassignment({
 *   reassignmentCommands: {
 *     commandId: 'unique-command-id',
 *     submitter: 'party1',
 *     commands: [assignCommand, unassignCommand],
 *     workflowId: 'workflow-123'
 *   },
 *   eventFormat: { verbose: true }
 * });
 * ```
 */
export const SubmitAndWaitForReassignment = createApiOperation<
  SubmitAndWaitForReassignmentParams,
  SubmitAndWaitForReassignmentResponse
>({
  paramsSchema: SubmitAndWaitForReassignmentParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params): SubmitAndWaitForReassignmentRequest => params as SubmitAndWaitForReassignmentRequest,
}); 