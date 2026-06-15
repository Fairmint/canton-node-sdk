import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * Submit an externally signed CC transfer
 *
 * Submits the signed transaction returned by prepareTransferPreapprovalSend.
 */
export const SubmitTransferPreapprovalSend = createApiOperation<
  operations['submitTransferPreapprovalSend']['requestBody']['content']['application/json'],
  operations['submitTransferPreapprovalSend']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    submission: z.object({
      party_id: z.string().min(1),
      transaction: z.string().min(1),
      signed_tx_hash: z.string().regex(/^[0-9a-fA-F]+$/),
      public_key: z.string().regex(/^[0-9a-fA-F]+$/),
    }),
  }) as z.ZodType<operations['submitTransferPreapprovalSend']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/admin/external-party/transfer-preapproval/submit-send`,
  buildRequestData: (params) => params,
});
