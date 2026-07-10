import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

type CreateUserRequest = operations['onboardUser']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated onboard-user request. */
export const CreateUserParamsSchema = createRequestSchema<CreateUserRequest>()({
  name: z.string(),
  party_id: z.string().optional(),
  createPartyIfMissing: z.boolean().optional(),
});

/**
 * Create a new user in the system
 *
 * @example
 *   ```typescript
 *   const user = await client.createUser({
 *   name: 'John Doe',
 *   party_id: 'party123'
 *   });
 *
 *   ```;
 */
export const CreateUser = createApiOperation<
  CreateUserRequest,
  operations['onboardUser']['responses']['200']['content']['application/json']
>({
  paramsSchema: CreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/users`,
  buildRequestData: (params) => params,
});
