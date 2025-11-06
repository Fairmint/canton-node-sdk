import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * List all users onboarded onto this validator
 *
 * @example
 *   ```typescript
 *   const result = await client.listUsers();
 *   console.log('Usernames:', result.usernames);
 *   ```;
 */
export const ListUsers = createApiOperation<
  void,
  operations['listUsers']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/users`,
  buildRequestData: () => ({}),
});


