import { z } from 'zod';

// Mining Round Parameters
export const GetMiningRoundDetailsParamsSchema = z.object({
  roundNumber: z.number(),
});
export const GetMiningRoundByContractIdParamsSchema = z.object({
  contractId: z.string(),
});

// Transfer Command Parameters
export const LookupTransferCommandCounterByPartyParamsSchema = z.object({
  party: z.string(),
});
export const LookupTransferCommandStatusParamsSchema = z.object({
  sender: z.string(),
  nonce: z.number(),
});

// Featured App Right Parameters
export const GetFeaturedAppRightParamsSchema = z.object({
  partyId: z.string().optional(),
});

// Transfer Preapproval Parameters
export const GetTransferPreapprovalsByPartyParamsSchema = z.object({
  partyId: z.string(),
});

// Token Standard Registry Parameters
export const GetRegistryInfoParamsSchema = z.void();
export const ListInstrumentsParamsSchema = z.object({
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});
export const GetInstrumentParamsSchema = z.object({
  instrumentId: z.string(),
});
export const GetAllocationFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.never()),
  excludeDebugFields: z.boolean(),
});
export const GetAllocationTransferContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string()).optional(),
});
export const GetAllocationWithdrawContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string()).optional(),
});
export const GetAllocationCancelContextParamsSchema = z.object({
  allocationId: z.string(),
  meta: z.record(z.string()).optional(),
});
export const GetTransferFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.never()),
  excludeDebugFields: z.boolean(),
});
export const GetTransferInstructionAcceptContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string()).optional(),
});
export const GetTransferInstructionRejectContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string()).optional(),
});
export const GetTransferInstructionWithdrawContextParamsSchema = z.object({
  transferInstructionId: z.string(),
  meta: z.record(z.string()).optional(),
});

export type GetMiningRoundDetailsParams = z.infer<typeof GetMiningRoundDetailsParamsSchema>;
export type GetMiningRoundByContractIdParams = z.infer<typeof GetMiningRoundByContractIdParamsSchema>;
export type LookupTransferCommandCounterByPartyParams = z.infer<typeof LookupTransferCommandCounterByPartyParamsSchema>;
export type LookupTransferCommandStatusParams = z.infer<typeof LookupTransferCommandStatusParamsSchema>;
export type GetFeaturedAppRightParams = z.infer<typeof GetFeaturedAppRightParamsSchema>;
export type GetTransferPreapprovalsByPartyParams = z.infer<typeof GetTransferPreapprovalsByPartyParamsSchema>;
export type GetRegistryInfoParams = z.infer<typeof GetRegistryInfoParamsSchema>;
export type ListInstrumentsParams = z.infer<typeof ListInstrumentsParamsSchema>;
export type GetInstrumentParams = z.infer<typeof GetInstrumentParamsSchema>;
export type GetAllocationFactoryParams = z.infer<typeof GetAllocationFactoryParamsSchema>;
export type GetAllocationTransferContextParams = z.infer<typeof GetAllocationTransferContextParamsSchema>;
export type GetAllocationWithdrawContextParams = z.infer<typeof GetAllocationWithdrawContextParamsSchema>;
export type GetAllocationCancelContextParams = z.infer<typeof GetAllocationCancelContextParamsSchema>;
export type GetTransferFactoryParams = z.infer<typeof GetTransferFactoryParamsSchema>;
export type GetTransferInstructionAcceptContextParams = z.infer<typeof GetTransferInstructionAcceptContextParamsSchema>;
export type GetTransferInstructionRejectContextParams = z.infer<typeof GetTransferInstructionRejectContextParamsSchema>;
export type GetTransferInstructionWithdrawContextParams = z.infer<typeof GetTransferInstructionWithdrawContextParamsSchema>; 