import { z } from 'zod';
import { type BaseClient, createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { CommandSchema, DisclosedContractSchema } from '../../../../../clients/ledger-json-api/schemas';

// Type aliases for better readability
type GeneratedRequest =
  paths['/v2/interactive-submission/prepare']['post']['requestBody']['content']['application/json'];
type GeneratedResponse =
  paths['/v2/interactive-submission/prepare']['post']['responses']['200']['content']['application/json'];

// Schema for the parameters
export const PrepareSubmissionParamsSchema = z.object({
  /** Unique identifier for the user preparing the transaction */
  userId: z.string().optional(),
  /** Unique identifier for the command */
  commandId: z.string(),
  /** Individual commands to execute atomically */
  commands: z.array(CommandSchema),
  /** Synchronizer ID */
  synchronizerId: z.string(),
  /** Party IDs that are acting in this transaction */
  actAs: z.array(z.string()),
  /** Party IDs that can read in this transaction (optional) */
  readAs: z.array(z.string()).optional(),
  /** Contracts to disclose to non-stakeholders (optional) */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Minimum ledger time (optional) */
  minLedgerTimeAbs: z.string().optional(),
  /** Application ID (optional) */
  applicationId: z.string().optional(),
  /** Package ID selection preference (optional) */
  packageIdSelectionPreference: z.array(z.string()).optional(),
  /** If true, include verbose hashing details in response for debugging (optional) */
  verboseHashing: z.boolean().optional(),
});

export type PrepareSubmissionParams = z.infer<typeof PrepareSubmissionParamsSchema>;

export type PrepareSubmissionResponse = GeneratedResponse;

/**
 * Prepare a transaction for external signing
 *
 * This endpoint interprets commands and returns a prepared transaction along with its hash.
 * The hash should be signed by the external party's private key, then submitted to the
 * execute endpoint along with the prepared transaction.
 *
 * @example
 *   ```typescript
 *   const prepared = await client.prepareSubmission({
 *     commandId: 'create-contract-123',
 *     commands: [{
 *       CreateCommand: {
 *         templateId: 'MyPackage:MyModule:MyTemplate',
 *         createArgument: { field: 'value' }
 *       }
 *     }],
 *     synchronizerId: 'global-synchronizer',
 *     actAs: ['alice::12abc...'],
 *   });
 *
 *   // Sign prepared.preparedTransactionHash with external key
 *   // Then pass prepared.preparedTransaction to execute endpoint
 *   ```;
 */
export const PrepareSubmission = createApiOperation<PrepareSubmissionParams, PrepareSubmissionResponse>({
  paramsSchema: PrepareSubmissionParamsSchema,
  method: 'POST',
  buildUrl: (_params: PrepareSubmissionParams, apiUrl: string) => `${apiUrl}/v2/interactive-submission/prepare`,
  buildRequestData: (params: PrepareSubmissionParams, _client: BaseClient): GeneratedRequest => ({
    userId: params.userId ?? '',
    commandId: params.commandId,
    commands: params.commands,
    synchronizerId: params.synchronizerId,
    actAs: params.actAs,
    readAs: params.readAs ?? [],
    disclosedContracts: params.disclosedContracts ?? [],
    packageIdSelectionPreference: params.packageIdSelectionPreference ?? [],
    verboseHashing: params.verboseHashing ?? false,
    ...(params.minLedgerTimeAbs && { minLedgerTimeAbs: params.minLedgerTimeAbs }),
    ...(params.applicationId && { applicationId: params.applicationId }),
  }),
});
