import { z } from 'zod';

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

/** Schema for a transfer offer in list responses. Uses passthrough() to allow additional server fields. */
export const TransferOfferSchema = z
  .object({
    /** Contract ID of the offer */
    contract_id: z.string(),
    /** Party ID of the receiver */
    receiver_party_id: z.string(),
    /** Amount to transfer */
    amount: z.string(),
    /** Description of the transfer */
    description: z.string(),
    /** Expiration timestamp */
    expires_at: z.number(),
    /** Tracking ID for the offer */
    tracking_id: z.string(),
    /** Status of the offer */
    status: z.string().optional(),
  })
  .passthrough();

export const ListTransferOffersResponseSchema = z.object({
  offers: z.array(TransferOfferSchema),
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
export type TransferOffer = z.infer<typeof TransferOfferSchema>;
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

// Get Amulets Response Schema
export const AmuletContractSchema = z.object({
  contract: z.object({
    template_id: z.string(),
    contract_id: z.string(),
    payload: z.unknown(),
    created_event_blob: z.string(),
    created_at: z.string(),
  }),
  domain_id: z.string(),
});

export const GetAmuletsResponseSchema = z.object({
  amulets: z.array(
    z.object({
      contract: AmuletContractSchema,
      round: z.number(),
      accrued_holding_fee: z.string(),
      effective_amount: z.string(),
    })
  ),
  locked_amulets: z.array(
    z.object({
      contract: AmuletContractSchema,
      round: z.number(),
      accrued_holding_fee: z.string(),
      effective_amount: z.string(),
    })
  ),
});

export type AmuletContract = z.infer<typeof AmuletContractSchema>;
export type GetAmuletsResponse = z.infer<typeof GetAmuletsResponseSchema>;
