import { z } from 'zod';

/**
 * Parameters for getting transfer factory.
 */
export const GetTransferFactoryParamsSchema = z.union([
  z.object({
    /** Choice arguments for the transfer. */
    choiceArguments: z.record(z.any()),
    /** Whether to exclude debug fields from the response. */
    excludeDebugFields: z.boolean(),
  }),
  z.object({
    /** Choice arguments for the transfer. */
    choiceArguments: z.record(z.any()),
  }).transform(data => ({
    ...data,
    excludeDebugFields: false,
  }))
]);

/**
 * Parameters for getting transfer instruction accept context.
 */
export const GetTransferInstructionAcceptContextParamsSchema = z.object({
  /** The contract ID of the transfer instruction to accept. */
  transferInstructionId: z.string(),
  /** Metadata that will be passed to the choice. */
  meta: z.record(z.string()).optional(),
});

/**
 * Parameters for getting transfer instruction reject context.
 */
export const GetTransferInstructionRejectContextParamsSchema = z.object({
  /** The contract ID of the transfer instruction to reject. */
  transferInstructionId: z.string(),
  /** Metadata that will be passed to the choice. */
  meta: z.record(z.string()).optional(),
});

/**
 * Parameters for getting transfer instruction withdraw context.
 */
export const GetTransferInstructionWithdrawContextParamsSchema = z.object({
  /** The contract ID of the transfer instruction to withdraw. */
  transferInstructionId: z.string(),
  /** Metadata that will be passed to the choice. */
  meta: z.record(z.string()).optional(),
});

// Export types
export type GetTransferFactoryParams = {
  choiceArguments: Record<string, any>;
  excludeDebugFields?: boolean;
};
export type GetTransferInstructionAcceptContextParams = z.infer<typeof GetTransferInstructionAcceptContextParamsSchema>;
export type GetTransferInstructionRejectContextParams = z.infer<typeof GetTransferInstructionRejectContextParamsSchema>;
export type GetTransferInstructionWithdrawContextParams = z.infer<typeof GetTransferInstructionWithdrawContextParamsSchema>; 