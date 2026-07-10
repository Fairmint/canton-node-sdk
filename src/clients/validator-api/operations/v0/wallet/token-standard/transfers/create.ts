import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../../../core';
import { type operations } from '../../../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

type CreateTokenStandardTransferRequest =
  operations['createTokenStandardTransfer']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated token-transfer request. */
export const CreateTokenStandardTransferParamsSchema = createRequestSchema<CreateTokenStandardTransferRequest>()({
  receiver_party_id: z.string(),
  amount: z.string(),
  description: z.string(),
  expires_at: z.number(),
  tracking_id: z.string(),
});

/**
 * Create a new token standard transfer to send tokens to another party
 *
 * @example
 *   ```typescript
 *   const result = await client.createTokenStandardTransfer({
 *   receiver_party_id: 'party123',
 *   amount: '100',
 *   description: 'Payment for services',
 *   expires_at: Date.now() + 3600000, // 1 hour from now
 *   tracking_id: 'unique-tracking-id'
 *   });
 *
 *   ```;
 */
export const CreateTokenStandardTransfer = createApiOperation<
  CreateTokenStandardTransferRequest,
  operations['createTokenStandardTransfer']['responses']['200']['content']['application/json']
>({
  paramsSchema: CreateTokenStandardTransferParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/token-standard/transfers`,
  buildRequestData: (params) => params,
});
