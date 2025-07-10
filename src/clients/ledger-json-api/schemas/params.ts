import { z } from 'zod';

export const NonEmptyStringSchema = z
  .string()
  .min(1, 'Value must be a non-empty string')
  .refine(val => val !== 'undefined', 'Value cannot be "undefined"');

export const GetEventsByContractIdParamsSchema = z.object({
  /** Contract ID to fetch events for. */
  contractId: NonEmptyStringSchema,
  /** Additional parties to read as (optional). */
  readAs: z.array(z.string()).optional(),
});

export const GetTransactionTreeByOffsetParamsSchema = z.object({
  /** Offset in the ledger to fetch the transaction tree from. */
  offset: NonEmptyStringSchema,
  /** Parties to include in the query (optional). */
  parties: z.array(z.string()).optional(),
});

export type GetEventsByContractIdParams = z.infer<typeof GetEventsByContractIdParamsSchema>;
export type GetTransactionTreeByOffsetParams = z.infer<typeof GetTransactionTreeByOffsetParamsSchema>; 