import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type GetAmuletsResponse } from '../../../schemas/api/wallet';

/**
 * Get the list of amulets and locked amulets for the current user
 *
 * @example
 *   ```typescript
 *   const amulets = await client.getAmulets();
 *
 *   ```;
 */
export const GetAmulets = createApiOperation<void, GetAmuletsResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/amulets`,
});
