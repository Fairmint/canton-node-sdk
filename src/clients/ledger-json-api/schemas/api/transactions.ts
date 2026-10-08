import { z } from 'zod';

export const CreateContractResponseSchema = z
  .object({
    /** Contract ID of the newly created contract. */
    contractId: z.string(),
    /** Update ID of the transaction that created the contract. */
    updateId: z.string(),
  })
  .strict();

export type CreateContractResponse = z.infer<typeof CreateContractResponseSchema>;
