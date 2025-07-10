import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

export const GetTransactionTreeByOffsetParamsSchema = z.object({
  /** Offset in the ledger to fetch the transaction tree from. */
  offset: NonEmptyStringSchema,
  /** Parties to include in the query (optional). */
  parties: z.array(z.string()).optional(),
});

export type GetTransactionTreeByOffsetParams = z.infer<typeof GetTransactionTreeByOffsetParamsSchema>; 