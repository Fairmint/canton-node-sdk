import { createApiOperation } from '../../../../../core';
import { type LookupTransferCommandStatusResponse } from '../../../schemas/api';
import {
  LookupTransferCommandStatusParamsSchema,
  type LookupTransferCommandStatusParams,
} from '../../../schemas/operations';

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
  buildUrl: (params, apiUrl: string) =>
    `${apiUrl}/api/validator/v0/scan-proxy/transfer-commands/${params.sender}/${params.nonce}/status`,
});
