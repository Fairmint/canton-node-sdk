import { createApiOperation } from '../../../../../core';
import { LookupTransferCommandStatusResponse } from '../../../schemas/api';
import { LookupTransferCommandStatusParamsSchema, LookupTransferCommandStatusParams } from '../../../schemas/operations';

/**
 * @description Lookup transfer command status
 * @example
 * ```typescript
 * const status = await client.lookupTransferCommandStatus({ 
 *   sender: 'party123', 
 *   nonce: 1 
 * });
 * console.log(`Status: ${status.status}`);
 * ```
 */
export const LookupTransferCommandStatus = createApiOperation<
  LookupTransferCommandStatusParams,
  LookupTransferCommandStatusResponse
>({
  paramsSchema: LookupTransferCommandStatusParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/transfer-commands/${params.sender}/${params.nonce}/status`,
}); 