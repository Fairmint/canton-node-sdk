import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * Create a new user in the system
 *
 * @example
 *   ```typescript
 *   const user = await client.createUser({
 *   name: 'John Doe',
 *   party_id: 'party123'
 *   });
 *   console.log(`User created with party ID: ${user.party_id}`);
 *   ```
 */
export const CreateUser = createApiOperation<
  operations['onboardUser']['requestBody']['content']['application/json'],
  operations['onboardUser']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    name: z.string(),
    party_id: z.string().optional(),
  }) as z.ZodType<operations['onboardUser']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/users`,
  buildRequestData: (params) => params,
});
