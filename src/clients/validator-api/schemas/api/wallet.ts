import { z } from 'zod';

// Wallet Balance Response
export const WalletBalanceResponseSchema = z.object({
  round: z.number(),
  effective_unlocked_qty: z.string(),
  effective_locked_qty: z.string(),
  total_holding_fees: z.string(),
});

export type WalletBalanceResponse = z.infer<typeof WalletBalanceResponseSchema>;

// User Status Response
export const UserStatusResponseSchema = z.object({
  party_id: z.string(),
  user_onboarded: z.boolean(),
  user_wallet_installed: z.boolean(),
  has_featured_app_right: z.boolean(),
});

export type UserStatusResponse = z.infer<typeof UserStatusResponseSchema>;

// Transfer Offer Schemas
export const CreateTransferOfferRequestSchema = z.object({
  receiver_party_id: z.string(),
  amount: z.string(),
  description: z.string(),
  expires_at: z.number(),
  tracking_id: z.string(),
});

export const CreateTransferOfferResponseSchema = z.object({
  offer_contract_id: z.string(),
});

export const ListTransferOffersResponseSchema = z.object({
  offers: z.array(z.any()),
});

export const GetTransferOfferStatusResponseSchema = z.object({
  status: z.enum(['created', 'accepted', 'completed', 'failed']),
  transaction_id: z.string().optional(),
  contract_id: z.string().optional(),
  failure_kind: z.enum(['expired', 'rejected', 'withdrawn']).optional(),
  withdrawn_reason: z.string().optional(),
});

export const AcceptTransferOfferResponseSchema = z.object({
  accepted_offer_contract_id: z.string(),
});

export const RejectTransferOfferResponseSchema = z.object({
  rejected_offer_contract_id: z.string(),
});

export const WithdrawTransferOfferResponseSchema = z.object({
  withdrawn_offer_contract_id: z.string(),
});

export type CreateTransferOfferRequest = z.infer<typeof CreateTransferOfferRequestSchema>;
export type CreateTransferOfferResponse = z.infer<typeof CreateTransferOfferResponseSchema>;
export type ListTransferOffersResponse = z.infer<typeof ListTransferOffersResponseSchema>;
export type GetTransferOfferStatusResponse = z.infer<typeof GetTransferOfferStatusResponseSchema>;
export type AcceptTransferOfferResponse = z.infer<typeof AcceptTransferOfferResponseSchema>;
export type RejectTransferOfferResponse = z.infer<typeof RejectTransferOfferResponseSchema>;
export type WithdrawTransferOfferResponse = z.infer<typeof WithdrawTransferOfferResponseSchema>;

// Buy Traffic Request Schemas
export const CreateBuyTrafficRequestSchema = z.object({
  receiving_validator_party_id: z.string(),
  domain_id: z.string(),
  traffic_amount: z.number(),
  tracking_id: z.string(),
  expires_at: z.number(),
});

export const CreateBuyTrafficRequestResponseSchema = z.object({
  request_contract_id: z.string(),
});

export const GetBuyTrafficRequestStatusResponseSchema = z.object({
  status: z.enum(['created', 'completed', 'failed']),
  transaction_id: z.string().optional(),
  failure_reason: z.enum(['expired', 'rejected']).optional(),
  rejection_reason: z.string().optional(),
});

export type CreateBuyTrafficRequest = z.infer<typeof CreateBuyTrafficRequestSchema>;
export type CreateBuyTrafficRequestResponse = z.infer<typeof CreateBuyTrafficRequestResponseSchema>;
export type GetBuyTrafficRequestStatusResponse = z.infer<typeof GetBuyTrafficRequestStatusResponseSchema>;

// Amulets Schemas
export const ListResponseSchema = z.object({
  amulets: z.array(z.any()),
  locked_amulets: z.array(z.any()),
});

export type ListResponse = z.infer<typeof ListResponseSchema>;

// Transfer Preapproval Schemas
export const TransferPreapprovalContractSchema = z.object({
  template_id: z.string(),
  contract_id: z.string(),
  payload: z.object({
    dso: z.string(),
    expiresAt: z.string(),
    receiver: z.string(),
    validFrom: z.string(),
    provider: z.string(),
    lastRenewedAt: z.string(),
  }),
  created_event_blob: z.string(),
  created_at: z.string(),
});

export const TransferPreapprovalResponseSchema = z.object({
  transfer_preapproval: z.object({
    contract: TransferPreapprovalContractSchema,
    domain_id: z.string(),
  }),
});

export const TransferPreapprovalSendRequestSchema = z.object({
  receiver_party_id: z.string(),
  amount: z.string(),
  deduplication_id: z.string(),
  description: z.string().optional(),
});

export type TransferPreapprovalContract = z.infer<typeof TransferPreapprovalContractSchema>;
export type TransferPreapprovalResponse = z.infer<typeof TransferPreapprovalResponseSchema>;
export type TransferPreapprovalSendRequest = z.infer<typeof TransferPreapprovalSendRequestSchema>;

// Token Standard Transfer Schemas
export const CreateTokenStandardTransferRequestSchema = z.object({
  receiver_party_id: z.string(),
  amount: z.string(),
  description: z.string(),
  expires_at: z.number(),
  tracking_id: z.string(),
});

export const TransferInstructionResultOutputSchema = z.object({
  transfer_instruction_cid: z.string().optional(),
  receiver_holding_cids: z.array(z.string()).optional(),
  dummy: z.object({}).optional(),
});

export const TransferInstructionResultResponseSchema = z.object({
  output: TransferInstructionResultOutputSchema,
  sender_change_cids: z.array(z.string()),
  meta: z.record(z.string()),
});

export const ListTokenStandardTransfersResponseSchema = z.object({
  transfers: z.array(z.any()),
});

export type CreateTokenStandardTransferRequest = z.infer<typeof CreateTokenStandardTransferRequestSchema>;
export type TransferInstructionResultOutput = z.infer<typeof TransferInstructionResultOutputSchema>;
export type TransferInstructionResultResponse = z.infer<typeof TransferInstructionResultResponseSchema>;
export type ListTokenStandardTransfersResponse = z.infer<typeof ListTokenStandardTransfersResponseSchema>; 