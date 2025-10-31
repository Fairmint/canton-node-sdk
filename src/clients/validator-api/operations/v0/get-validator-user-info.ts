import { z } from 'zod';
import { createApiOperation } from '../../../../core';

export interface GetValidatorUserInfoResponse {
  party_id: string;
  user_name: string;
  featured: boolean;
}

/**
 * Get public information about the validator operator
 *
 * @example
 * ```typescript
 * const info = await client.getValidatorUserInfo();
 * console.log('User name:', info.user_name);
 * console.log('Party ID:', info.party_id);
 * ```
 */
export const GetValidatorUserInfo = createApiOperation<void, GetValidatorUserInfoResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/api/validator/v0/validator-user`,
  buildRequestData: () => ({}),
});
