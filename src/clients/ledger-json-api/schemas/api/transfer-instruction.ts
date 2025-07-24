import { z } from 'zod';

// Base schemas
export const TransferInstructionDisclosedContractSchema = z.object({
  templateId: z.string(),
  contractId: z.string(),
  createdEventBlob: z.string(),
  synchronizerId: z.string(),
  debugPackageName: z.string().optional(),
  debugPayload: z.record(z.any()).optional(),
  debugCreatedAt: z.string().optional(),
});

export const TransferInstructionChoiceContextSchema = z.object({
  choiceContextData: z.record(z.any()),
  disclosedContracts: z.array(TransferInstructionDisclosedContractSchema),
});

export const TransferFactoryWithChoiceContextSchema = z.object({
  factoryId: z.string(),
  transferKind: z.enum(['self', 'direct', 'offer']),
  choiceContext: TransferInstructionChoiceContextSchema,
});

// Request schemas
export const GetFactoryRequestSchema = z.object({
  choiceArguments: z.record(z.any()),
  excludeDebugFields: z.boolean().default(false),
});

export const GetChoiceContextRequestSchema = z.object({
  meta: z.record(z.string()).optional(),
});

// Type exports
export type TransferInstructionDisclosedContract = z.infer<typeof TransferInstructionDisclosedContractSchema>;
export type TransferInstructionChoiceContext = z.infer<typeof TransferInstructionChoiceContextSchema>;
export type TransferFactoryWithChoiceContext = z.infer<typeof TransferFactoryWithChoiceContextSchema>;
export type GetFactoryRequest = z.infer<typeof GetFactoryRequestSchema>;
export type GetChoiceContextRequest = z.infer<typeof GetChoiceContextRequestSchema>;

// Response types
export type GetTransferFactoryResponse = TransferFactoryWithChoiceContext;
export type GetTransferInstructionAcceptContextResponse = TransferInstructionChoiceContext;
export type GetTransferInstructionRejectContextResponse = TransferInstructionChoiceContext;
export type GetTransferInstructionWithdrawContextResponse = TransferInstructionChoiceContext; 