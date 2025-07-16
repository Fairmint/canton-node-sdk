import { BaseClient, createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { SubmitAndWaitResponse } from '../../../schemas/api';

// Type aliases for better readability and to avoid repetition
type SubmitAndWaitRequest = paths['/v2/commands/submit-and-wait']['post']['requestBody']['content']['application/json'];

// Schema for the parameters  
export const SubmitAndWaitParamsSchema = z.object({
  /** Commands to submit and wait for completion. */
  commands: z.array(z.any()),
  /** Unique identifier for the command. */
  commandId: z.string(),
  /** Parties on whose behalf the command should be executed. */
  actAs: z.array(z.string()),
  /** User ID submitting the command (optional if using authentication). */
  userId: z.string().optional(),
  /** Parties to read as (optional). */
  readAs: z.array(z.string()).optional(),
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: z.any().optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: z.string().optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: z.any().optional(),
  /** Submission ID (optional). */
  submissionId: z.string().optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(z.any()).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(z.string()).optional(),
});

export type SubmitAndWaitParams = z.infer<typeof SubmitAndWaitParamsSchema>;

/**
 * @description Submit a batch of commands and wait for the completion details
 * @example
 * ```typescript
 * const result = await client.submitAndWait({
 *   commands: [createCommand, exerciseCommand],
 *   commandId: 'unique-command-id',
 *   actAs: ['party1', 'party2'],
 *   userId: 'user123'
 * });
 * ```
 * @param commands - Array of commands to submit
 * @param commandId - Unique identifier for the command
 * @param actAs - Parties on whose behalf the command should be executed
 * @param userId - User ID submitting the command (optional if using authentication)
 * @param readAs - Parties to read as (optional)
 * @param workflowId - Workflow ID (optional)
 * @param deduplicationPeriod - Deduplication period (optional)
 * @param minLedgerTimeAbs - Minimum ledger time absolute (optional)
 * @param minLedgerTimeRel - Minimum ledger time relative (optional)
 * @param submissionId - Submission ID (optional)
 * @param disclosedContracts - Disclosed contracts (optional)
 * @param synchronizerId - Synchronizer ID (optional)
 * @param packageIdSelectionPreference - Package ID selection preference (optional)
 */
export const SubmitAndWait = createApiOperation<
  SubmitAndWaitParams,
  SubmitAndWaitResponse
>({
  paramsSchema: SubmitAndWaitParamsSchema,
  method: 'POST',
  buildUrl: (_params: SubmitAndWaitParams, apiUrl: string) => `${apiUrl}/v2/commands/submit-and-wait`,
  buildRequestData: (params: SubmitAndWaitParams, client: BaseClient): SubmitAndWaitRequest => {
    const currentPartyId = client.getPartyId();
    
    const readParties = Array.from(
      new Set([
        currentPartyId,
        ...(params.readAs || []),
      ])
    );

    return {
      commands: params.commands,
      commandId: params.commandId,
      actAs: params.actAs,
      readAs: readParties,
      userId: params.userId,
      workflowId: params.workflowId,
      deduplicationPeriod: params.deduplicationPeriod,
      minLedgerTimeAbs: params.minLedgerTimeAbs,
      minLedgerTimeRel: params.minLedgerTimeRel,
      submissionId: params.submissionId,
      disclosedContracts: params.disclosedContracts,
      synchronizerId: params.synchronizerId,
      packageIdSelectionPreference: params.packageIdSelectionPreference,
    };
  },
}); 