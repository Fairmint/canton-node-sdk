import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

type TransferPreapprovalSendRequest =
  operations['transferPreapprovalSend']['requestBody']['content']['application/json'];
type TransferPreapprovalSendResponse = operations['transferPreapprovalSend']['responses']['200'];

/** Send CC from the authenticated wallet to a party with transfer preapproval. */
export const TransferPreapprovalSend = createApiOperation<
  TransferPreapprovalSendRequest,
  TransferPreapprovalSendResponse
>({
  paramsSchema: z.object({
    receiver_party_id: z.string().min(1),
    amount: z.string().min(1),
    deduplication_id: z.string().min(1),
    description: z.string().optional(),
  }) as z.ZodType<TransferPreapprovalSendRequest>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/wallet/transfer-preapproval/send`,
  buildRequestData: (params): TransferPreapprovalSendRequest => params,
});
