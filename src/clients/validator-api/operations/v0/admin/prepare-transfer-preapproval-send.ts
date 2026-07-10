import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

type PrepareTransferPreapprovalSendRequest =
  operations['prepareTransferPreapprovalSend']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated prepare-send request. */
export const PrepareTransferPreapprovalSendParamsSchema = createRequestSchema<PrepareTransferPreapprovalSendRequest>()({
  sender_party_id: z.string().min(1),
  receiver_party_id: z.string().min(1),
  amount: z.number().positive(),
  expires_at: z.string().min(1),
  nonce: z.number().int().nonnegative(),
  verbose_hashing: z.boolean().default(false),
  description: z.string().optional(),
});

/**
 * Prepare an externally signed CC transfer
 *
 * Prepares a TransferCommand transaction that must be signed by the external sender and then submitted with
 * submitTransferPreapprovalSend.
 */
export const PrepareTransferPreapprovalSend = createApiOperation<
  PrepareTransferPreapprovalSendRequest,
  operations['prepareTransferPreapprovalSend']['responses']['200']['content']['application/json']
>({
  paramsSchema: PrepareTransferPreapprovalSendParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/admin/external-party/transfer-preapproval/prepare-send`,
  buildRequestData: (params) => params,
});
