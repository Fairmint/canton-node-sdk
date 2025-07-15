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

export type GetMiningRoundDetailsParams = z.infer<typeof GetMiningRoundDetailsParamsSchema>;
export type GetMiningRoundByContractIdParams = z.infer<typeof GetMiningRoundByContractIdParamsSchema>;
export type LookupTransferCommandCounterByPartyParams = z.infer<typeof LookupTransferCommandCounterByPartyParamsSchema>;
export type LookupTransferCommandStatusParams = z.infer<typeof LookupTransferCommandStatusParamsSchema>;
export type GetFeaturedAppRightParams = z.infer<typeof GetFeaturedAppRightParamsSchema>;
export type GetTransferPreapprovalsByPartyParams = z.infer<typeof GetTransferPreapprovalsByPartyParamsSchema>; 