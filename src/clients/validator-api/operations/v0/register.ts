import { z } from 'zod';
import { createApiOperation } from '../../../../core';
import { type operations } from '../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * Register a new user to the validator API (one-time operation)
 *
 * @example
 *   ```typescript
 *   const result = await client.registerNewUser();
 *   
 *   ```
 */
export const RegisterNewUser = createApiOperation<
  void,
  operations['register']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'POST',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/register`,
  buildRequestData: () => ({}),
});
