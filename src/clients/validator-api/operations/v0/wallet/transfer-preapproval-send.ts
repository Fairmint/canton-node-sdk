import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

type TransferPreapprovalSendRequest =
  operations['transferPreapprovalSend']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated transfer-preapproval request. */
export const TransferPreapprovalSendParamsSchema = createRequestSchema<TransferPreapprovalSendRequest>()({
  receiver_party_id: z.string().min(1),
  amount: z.string().min(1),
  deduplication_id: z.string().min(1),
  description: z.string().optional(),
});

/** Send CC from the authenticated wallet to a party with transfer preapproval. */
export const TransferPreapprovalSend = createApiOperation<TransferPreapprovalSendRequest, void>({
  paramsSchema: TransferPreapprovalSendParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/wallet/transfer-preapproval/send`,
  buildRequestData: (params): TransferPreapprovalSendRequest => params,
});
