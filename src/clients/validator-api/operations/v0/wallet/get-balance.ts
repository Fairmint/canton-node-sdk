import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

/**
 * Get the current wallet balance including unlocked and locked quantities
 *
 * @example
 *   ```typescript
 *   const balance = await client.getWalletBalance();
 *   
 *   ```
 */
export const GetWalletBalance = createApiOperation<
  void,
  operations['getBalance']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/balance`,
});
