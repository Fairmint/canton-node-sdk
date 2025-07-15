import { createApiOperation } from '../../../../../core';
import { ListResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description Get the list of amulets and locked amulets for the current user
 * @example
 * ```typescript
 * const amulets = await client.getAmulets();
 * console.log(`Amulets: ${amulets.amulets.length}, Locked: ${amulets.locked_amulets.length}`);
 * ```
 */
export const GetAmulets = createApiOperation<
  void,
  ListResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/amulets`,
}); 