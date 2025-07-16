import { createApiOperation } from '../../../../../core';
import { OnboardUserResponse } from '../../../schemas/api';
import { CreateUserParamsSchema, CreateUserParams } from '../../../schemas/operations';

/**
 * @description Create a new user in the system
 * @example
 * ```typescript
 * const user = await client.createUser({
 *   name: 'John Doe',
 *   party_id: 'party123'
 * });
 * console.log(`User created with party ID: ${user.party_id}`);
 * ```
 */
export const CreateUser = createApiOperation<
  CreateUserParams,
  OnboardUserResponse
>({
  paramsSchema: CreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/users`,
  buildRequestData: (params) => params,
}); 