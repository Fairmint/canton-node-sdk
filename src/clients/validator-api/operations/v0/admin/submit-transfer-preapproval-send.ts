import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

const HEX_BYTES_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;

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
      signed_tx_hash: z.string().regex(HEX_BYTES_PATTERN),
      public_key: z.string().regex(HEX_BYTES_PATTERN),
    }),
  }) as z.ZodType<operations['submitTransferPreapprovalSend']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/admin/external-party/transfer-preapproval/submit-send`,
  buildRequestData: (params) => params,
});
