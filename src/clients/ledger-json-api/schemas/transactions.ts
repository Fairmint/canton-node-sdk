import { z } from 'zod';
import { TreeEventSchema } from './events';

export const TransactionTreeSchema = z
  .object({
    updateId: z.string(),
    commandId: z.string().optional(),
    workflowId: z.string().optional(),
    effectiveAt: z.string(),
    offset: z.number(),
    eventsById: z.record(TreeEventSchema),
    recordTime: z.string(),
    synchronizerId: z.string(),
    traceContext: z.object({
      traceparent: z.string(),
      tracestate: z.string().nullable(),
    }).optional(),
  })
  .strict();

export const CommandResponseSchema = z
  .object({
    transactionTree: TransactionTreeSchema,
  })
  .strict();

export const CreateContractResponseSchema = z
  .object({
    contractId: z.string(),
    updateId: z.string(),
  })
  .strict();

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

export const TransactionTreeByOffsetResponseSchema = z
  .object({
    transaction: TransactionTreeSchema,
  })
  .strict();

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