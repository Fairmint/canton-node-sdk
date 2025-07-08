import { z } from 'zod';
import { TreeEventSchema } from './events';

// Transaction tree schema
export const TransactionTreeSchema = z
  .object({
    transaction: z
      .object({
        updateId: z.string(),
      })
      .strict()
      .optional(),
    updateId: z.string(),
    effectiveAt: z.string(),
    offset: z.string(),
    eventsById: z.record(TreeEventSchema),
    recordTime: z.string(),
    synchronizerId: z.string(),
  })
  .strict();

// Command response schema
export const CommandResponseSchema = z
  .object({
    transactionTree: TransactionTreeSchema,
  })
  .strict();

// Create contract response schema
export const CreateContractResponseSchema = z
  .object({
    contractId: z.string(),
    updateId: z.string(),
  })
  .strict();

// Update by ID schemas
export const UpdateByIdRequestSchema = z
  .object({
    updateId: z.string(),
    requestingParties: z.array(z.string()),
    updateFormat: z.string(),
    includeTransactions: z.boolean(),
  })
  .strict();

export const UpdateByIdResponseSchema = z
  .object({
    update: TransactionTreeSchema,
  })
  .strict();

// Transaction tree by offset response schema
export const TransactionTreeByOffsetResponseSchema = z
  .object({
    transactionTree: TransactionTreeSchema,
  })
  .strict();

// Type exports
export type TransactionTree = z.infer<typeof TransactionTreeSchema>;
export type CommandResponse = z.infer<typeof CommandResponseSchema>;
export type CreateContractResponse = z.infer<
  typeof CreateContractResponseSchema
>;
export type UpdateByIdRequest = z.infer<typeof UpdateByIdRequestSchema>;
export type UpdateByIdResponse = z.infer<typeof UpdateByIdResponseSchema>;
export type TransactionTreeByOffsetResponse = z.infer<
  typeof TransactionTreeByOffsetResponseSchema
>; 