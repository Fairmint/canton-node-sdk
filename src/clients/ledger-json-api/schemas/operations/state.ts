import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

/**
 * Parameters for getting active contracts.
 */
export const GetActiveContractsParamsSchema = z.object({
  /** The offset at which the snapshot of the active contracts will be computed. Defaults to 0 if not provided. */
  activeAtOffset: z.number().optional(),
  /** Maximum number of elements to return (optional). */
  limit: z.number().optional(),
  /** Timeout to complete and send result if no new elements are received (optional). */
  streamIdleTimeoutMs: z.number().optional(),
  /** Parties to filter by (optional). */
  parties: z.array(z.string()).optional(),
  /** Whether to include verbose information (optional). */
  verbose: z.boolean().optional(),
});

/**
 * Parameters for getting connected synchronizers.
 */
export const GetConnectedSynchronizersParamsSchema = z.object({
  /** Party to get synchronizers for. */
  party: NonEmptyStringSchema,
  /** Participant ID (optional). */
  participantId: z.string().optional(),
});

/**
 * Parameters for getting ledger end.
 */
export const GetLedgerEndParamsSchema = z.object({});

/**
 * Parameters for getting latest pruned offsets.
 */
export const GetLatestPrunedOffsetsParamsSchema = z.object({});

// Export types
export type GetActiveContractsParams = z.infer<typeof GetActiveContractsParamsSchema>;
export type GetConnectedSynchronizersParams = z.infer<typeof GetConnectedSynchronizersParamsSchema>;
export type GetLedgerEndParams = z.infer<typeof GetLedgerEndParamsSchema>;
export type GetLatestPrunedOffsetsParams = z.infer<typeof GetLatestPrunedOffsetsParamsSchema>; 