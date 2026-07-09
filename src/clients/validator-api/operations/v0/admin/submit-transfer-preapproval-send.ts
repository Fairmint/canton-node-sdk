import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

const HEX_BYTES_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;

type SubmitTransferPreapprovalSendRequest =
  operations['submitTransferPreapprovalSend']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated transfer-submission request. */
export const SubmitTransferPreapprovalSendParamsSchema = createRequestSchema<SubmitTransferPreapprovalSendRequest>()({
  submission: z.object({
    party_id: z.string().min(1),
    transaction: z.string().min(1),
    signed_tx_hash: z.string().regex(HEX_BYTES_PATTERN),
    public_key: z.string().regex(HEX_BYTES_PATTERN),
  }),
});

/**
 * Submit an externally signed CC transfer
 *
 * Submits the signed transaction returned by prepareTransferPreapprovalSend.
 */
export const SubmitTransferPreapprovalSend = createApiOperation<
  SubmitTransferPreapprovalSendRequest,
  operations['submitTransferPreapprovalSend']['responses']['200']['content']['application/json']
>({
  paramsSchema: SubmitTransferPreapprovalSendParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/admin/external-party/transfer-preapproval/submit-send`,
  buildRequestData: (params) => params,
});
