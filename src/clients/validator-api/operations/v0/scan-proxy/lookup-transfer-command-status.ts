import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

export type LookupTransferCommandStatusParams = operations['lookupTransferCommandStatus']['parameters']['query'];
export type LookupTransferCommandStatusResponse =
  operations['lookupTransferCommandStatus']['responses']['200']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated query parameters. */
export const LookupTransferCommandStatusParamsSchema = createRequestSchema<LookupTransferCommandStatusParams>()({
  sender: z.string(),
  nonce: z.number().int(),
});

/**
 * Lookup transfer command status
 *
 * @example
 *   ```typescript
 *   const status = await client.lookupTransferCommandStatus({
 *   sender: 'party123',
 *   nonce: 1
 *   });
 *
 *   ```;
 */
export const LookupTransferCommandStatus = createApiOperation<
  LookupTransferCommandStatusParams,
  LookupTransferCommandStatusResponse
>({
  paramsSchema: LookupTransferCommandStatusParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => {
    const query = new URLSearchParams({
      sender: params.sender,
      nonce: String(params.nonce),
    });
    return `${apiUrl}/api/validator/v0/scan-proxy/transfer-command/status?${query.toString()}`;
  },
});
