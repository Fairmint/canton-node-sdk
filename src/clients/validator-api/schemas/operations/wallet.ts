import { z } from 'zod';
import { 
  CreateTransferOfferRequestSchema,
  CreateBuyTrafficRequestSchema,
  CreateTokenStandardTransferRequestSchema,
  TransferPreapprovalSendRequestSchema
} from '../api/wallet';

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
export const CreateBuyTrafficRequestParamsSchema = CreateBuyTrafficRequestSchema;
export const GetBuyTrafficRequestStatusParamsSchema = z.object({
  trackingId: z.string(),
});

// Token Standard Transfer Parameters
export const CreateTokenStandardTransferParamsSchema = CreateTokenStandardTransferRequestSchema;
export const AcceptTokenStandardTransferParamsSchema = z.object({
  contractId: z.string(),
});
export const RejectTokenStandardTransferParamsSchema = z.object({
  contractId: z.string(),
});
export const WithdrawTokenStandardTransferParamsSchema = z.object({
  contractId: z.string(),
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
export type CreateTokenStandardTransferParams = z.infer<typeof CreateTokenStandardTransferParamsSchema>;
export type AcceptTokenStandardTransferParams = z.infer<typeof AcceptTokenStandardTransferParamsSchema>;
export type RejectTokenStandardTransferParams = z.infer<typeof RejectTokenStandardTransferParamsSchema>;
export type WithdrawTokenStandardTransferParams = z.infer<typeof WithdrawTokenStandardTransferParamsSchema>;
export type TransferPreapprovalSendParams = z.infer<typeof TransferPreapprovalSendParamsSchema>; 