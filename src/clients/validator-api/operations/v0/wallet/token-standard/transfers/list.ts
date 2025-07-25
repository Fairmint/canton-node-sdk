import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { operations } from '../../../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

/**
 * @description List all token standard transfers for the current user
 * @example
 * ```typescript
 * const transfers = await client.listTokenStandardTransfers();
 * console.log(`Found ${transfers.transfers.length} transfers`);
 * ```
 */
export const ListTokenStandardTransfers = createApiOperation<
  void,
  operations['listTokenStandardTransfers']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/token-standard/transfers`,
}); 