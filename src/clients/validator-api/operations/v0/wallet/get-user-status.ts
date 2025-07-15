import { createApiOperation } from '../../../../../core';
import { UserStatusResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description Get the current user status including onboarding and wallet installation status
 * @example
 * ```typescript
 * const status = await client.getUserStatus();
 * console.log(`User onboarded: ${status.user_onboarded}, Wallet installed: ${status.user_wallet_installed}`);
 * ```
 */
export const GetUserStatus = createApiOperation<
  void,
  UserStatusResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/user-status`,
}); 