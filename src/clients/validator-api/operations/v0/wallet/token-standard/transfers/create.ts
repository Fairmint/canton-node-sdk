import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type operations } from '../../../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

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
  operations['createTokenStandardTransfer']['requestBody']['content']['application/json'],
  operations['createTokenStandardTransfer']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    receiver_party_id: z.string(),
    amount: z.string(),
    description: z.string(),
    expires_at: z.number(),
    tracking_id: z.string(),
  }) as z.ZodType<operations['createTokenStandardTransfer']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/token-standard/transfers`,
  buildRequestData: (params) => params,
});
