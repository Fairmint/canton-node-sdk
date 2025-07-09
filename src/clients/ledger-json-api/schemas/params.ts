import { z } from 'zod';

// Common parameter schemas
export const NonEmptyStringSchema = z
  .string()
  .min(1, 'Value must be a non-empty string')
  .refine(val => val !== 'undefined', 'Value cannot be "undefined"');

export const GetEventsByContractIdParamsSchema = z.object({
  contractId: NonEmptyStringSchema,
  readAs: z.array(z.string()).optional(),
});

export const GetTransactionTreeByOffsetParamsSchema = z.object({
  offset: NonEmptyStringSchema,
  parties: z.array(z.string()).optional(),
});

// Type exports
export type GetEventsByContractIdParams = z.infer<typeof GetEventsByContractIdParamsSchema>;
export type GetTransactionTreeByOffsetParams = z.infer<typeof GetTransactionTreeByOffsetParamsSchema>; 