import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

/**
 * Get the list of amulets and locked amulets for the current user
 *
 * @example
 *   ```typescript
 *   const amulets = await client.getAmulets();
 *
 *   ```;
 */
export const GetAmulets = createApiOperation<
  void,
  operations['list']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/amulets`,
});
