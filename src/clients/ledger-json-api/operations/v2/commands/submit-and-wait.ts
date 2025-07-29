import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/commands/submit-and-wait' as const;

// Custom params schema for user input with comments from OpenAPI docs
export const SubmitAndWaitParamsSchema = z.object({
  /** Commands to submit and wait for completion. */
  commands: z.array(z.any()),
  /** Unique identifier for the command. */
  commandId: z.string().min(1),
  /** Parties on whose behalf the command should be executed. */
  actAs: z.array(z.string().min(1)),
  /** User ID submitting the command (optional if using authentication). */
  userId: z.string().min(1).optional(),
  /** Parties to read as (optional). */
  readAs: z.array(z.string().min(1)).optional(),
  /** Workflow ID (optional). */
  workflowId: z.string().min(1).optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: z.string().min(1).optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: z.string().min(1).optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().min(1).optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(z.string().min(1)).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(z.any()).optional(),
});

export type SubmitAndWaitParams = z.infer<typeof SubmitAndWaitParamsSchema>;

// Network call types from auto-generated OpenAPI
export type SubmitAndWaitRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type SubmitAndWaitResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * @description Submit a batch of commands and wait for the completion details
 * @example
 * ```typescript
 * const result = await client.submitAndWait({
 *   commands: [createCommand, exerciseCommand],
 *   commandId: 'unique-command-id',
 *   actAs: ['party1', 'party2'],
 *   userId: 'user123',
 *   workflowId: 'workflow-123'
 * });
 * ```
 */
export const SubmitAndWait = createApiOperation<SubmitAndWaitParams, SubmitAndWaitResponse>({
  paramsSchema: SubmitAndWaitParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params): SubmitAndWaitRequest => params as SubmitAndWaitRequest,
}); 