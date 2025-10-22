import { z } from 'zod';
import { CreateTransferOfferRequestSchema, TransferPreapprovalSendRequestSchema } from '../api/wallet';

// Transfer Offer Parameters
export const CreateTransferOfferParamsSchema = CreateTransferOfferRequestSchema;
export const GetTransferOfferStatusParamsSchema = z.object({
  trackingId: z.string(),
});
export const AcceptTransferOfferParamsSchema = z.object({
  contractId: z.string(),
});
export const RejectTransferOfferParamsSchema = z.object({
  contractId: z.string(),
});
export const WithdrawTransferOfferParamsSchema = z.object({
  contractId: z.string(),
});

// Buy Traffic Request Parameters
export const CreateBuyTrafficRequestParamsSchema = z.object({
  traffic_amount: z.number(),
  receiving_validator_party_id: z.string().optional(),
});
export const GetBuyTrafficRequestStatusParamsSchema = z.object({
  trackingId: z.string(),
});

// Transfer Preapproval Parameters
export const TransferPreapprovalSendParamsSchema = TransferPreapprovalSendRequestSchema;

export type CreateTransferOfferParams = z.infer<typeof CreateTransferOfferParamsSchema>;
export type GetTransferOfferStatusParams = z.infer<typeof GetTransferOfferStatusParamsSchema>;
export type AcceptTransferOfferParams = z.infer<typeof AcceptTransferOfferParamsSchema>;
export type RejectTransferOfferParams = z.infer<typeof RejectTransferOfferParamsSchema>;
export type WithdrawTransferOfferParams = z.infer<typeof WithdrawTransferOfferParamsSchema>;
export type CreateBuyTrafficRequestParams = z.infer<typeof CreateBuyTrafficRequestParamsSchema>;
export type GetBuyTrafficRequestStatusParams = z.infer<typeof GetBuyTrafficRequestStatusParamsSchema>;
export type TransferPreapprovalSendParams = z.infer<typeof TransferPreapprovalSendParamsSchema>;
