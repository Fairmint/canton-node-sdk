import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

/** Send CC from the authenticated wallet to a party with transfer preapproval. */
export const TransferPreapprovalSend = createApiOperation<
  operations['transferPreapprovalSend']['requestBody']['content']['application/json'],
  unknown
>({
  paramsSchema: z.object({
    receiver_party_id: z.string().min(1),
    amount: z.string().min(1),
    deduplication_id: z.string().min(1),
    description: z.string().optional(),
  }) as z.ZodType<operations['transferPreapprovalSend']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/transfer-preapproval/send`,
  buildRequestData: (params) => params,
});
