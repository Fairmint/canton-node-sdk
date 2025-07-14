import { createApiOperation } from '../../../../../core';
import { SubmitAndWaitForTransactionParamsSchema, SubmitAndWaitForTransactionParams } from '../../../schemas/operations';
import { JsSubmitAndWaitForTransactionResponse } from '../../../schemas/api';

/**
 * @description Submit a batch of commands and wait for the transaction response
 * @example
 * ```typescript
 * const result = await client.submitAndWaitForTransaction({
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
 * @param prefetchContractKeys - Prefetch contract keys (optional)
 * @param transactionFormat - Transaction format (optional)
 */
export const SubmitAndWaitForTransaction = createApiOperation<
  SubmitAndWaitForTransactionParams,
  JsSubmitAndWaitForTransactionResponse
>({
  paramsSchema: SubmitAndWaitForTransactionParamsSchema,
  method: 'POST',
  buildUrl: (_params: SubmitAndWaitForTransactionParams, apiUrl: string) => `${apiUrl}/v2/commands/submit-and-wait-for-transaction`,
  buildRequestData: (params: SubmitAndWaitForTransactionParams, client) => {
    const currentPartyId = client.getPartyId();
    
    const readParties = Array.from(
      new Set([
        currentPartyId,
        ...(params.readAs || []),
      ])
    );

    return {
      commands: {
        commands: params.commands,
        commandId: params.commandId,
        actAs: params.actAs,
        userId: params.userId,
        readAs: readParties,
        workflowId: params.workflowId,
        deduplicationPeriod: params.deduplicationPeriod,
        minLedgerTimeAbs: params.minLedgerTimeAbs,
        minLedgerTimeRel: params.minLedgerTimeRel,
        submissionId: params.submissionId,
        disclosedContracts: params.disclosedContracts,
        synchronizerId: params.synchronizerId,
        packageIdSelectionPreference: params.packageIdSelectionPreference,
        prefetchContractKeys: params.prefetchContractKeys,
      },
      transactionFormat: params.transactionFormat,
    };
  },
}); 