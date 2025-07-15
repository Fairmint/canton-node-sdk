import { createApiOperation } from '../../../../../core';
import { WalletBalanceResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description Get the current wallet balance including unlocked and locked quantities
 * @example
 * ```typescript
 * const balance = await client.getWalletBalance();
 * console.log(`Unlocked: ${balance.effective_unlocked_qty}, Locked: ${balance.effective_locked_qty}`);
 * ```
 */
export const GetWalletBalance = createApiOperation<
  void,
  WalletBalanceResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/balance`,
}); 