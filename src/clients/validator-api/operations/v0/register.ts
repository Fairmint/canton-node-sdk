import { createApiOperation } from '../../../../core';
import { RegisterResponse } from '../../schemas/api';
import { z } from 'zod';

/**
 * @description Register a new user to the validator API (one-time operation)
 * @example
 * ```typescript
 * const result = await client.registerNewUser();
 * console.log(`User registered with party ID: ${result.party_id}`);
 * ```
 */
export const RegisterNewUser = createApiOperation<
  void,
  RegisterResponse
>({
  paramsSchema: z.void(),
  method: 'POST',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/register`,
  buildRequestData: () => ({}),
}); 