import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { CommandSchema, DeduplicationPeriodSchema, DisclosedContractSchema } from '../../../schemas/api/commands';
import { MinLedgerTimeRelSchema, PrefetchContractKeySchema } from '../../../schemas/common';

const endpoint = '/v2/commands/submit-and-wait-for-transaction-tree' as const;

// Zod schema for the input parameters
export const SubmitAndWaitForTransactionTreeParamsSchema = z.object({
  /** Commands to submit and wait for transaction tree. */
  commands: z.array(CommandSchema),
  /** Unique identifier for the command (optional, will be auto-generated if not provided). */
  commandId: z.string().optional(),
  /** Parties on whose behalf the command should be executed (optional, will use client's party ID if not provided). */
  actAs: z.array(z.string()).optional(),
  /** User ID submitting the command (optional if using authentication). */
  userId: z.string().optional(),
  /** Parties to read as (optional). */
  readAs: z.array(z.string()).optional(),
  /** Workflow ID (optional). */
  workflowId: z.string().optional(),
  /** Deduplication period (optional). */
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  /** Minimum ledger time absolute (optional). */
  minLedgerTimeAbs: z.string().optional(),
  /** Minimum ledger time relative (optional). */
  minLedgerTimeRel: MinLedgerTimeRelSchema.optional(),
  /** Submission ID (optional). */
  submissionId: z.string().optional(),
  /** Disclosed contracts (optional). */
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  /** Synchronizer ID (optional). */
  synchronizerId: z.string().optional(),
  /** Package ID selection preference (optional). */
  packageIdSelectionPreference: z.array(z.string()).optional(),
  /** Prefetch contract keys (optional). */
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
});

// Extended type with optional commandId and actAs
export type SubmitAndWaitForTransactionTreeParams = z.infer<typeof SubmitAndWaitForTransactionTreeParamsSchema>;

export type SubmitAndWaitForTransactionTreeResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const SubmitAndWaitForTransactionTree = createApiOperation<
  SubmitAndWaitForTransactionTreeParams,
  SubmitAndWaitForTransactionTreeResponse
>({
  paramsSchema: SubmitAndWaitForTransactionTreeParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
    ...params,
    commandId:
      params.commandId ??
      `submit-and-wait-for-transaction-tree-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    actAs: params.actAs ?? [client.getPartyId()],
  }),
});
