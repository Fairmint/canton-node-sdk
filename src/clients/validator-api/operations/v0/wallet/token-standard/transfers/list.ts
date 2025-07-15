import { createApiOperation } from '../../../../../../../core';
import { ListTokenStandardTransfersResponse } from '../../../../../schemas/api';
import { z } from 'zod';

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
  ListTokenStandardTransfersResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/token-standard/transfers`,
}); 