import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

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
  operations['list']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/amulets`,
}); 