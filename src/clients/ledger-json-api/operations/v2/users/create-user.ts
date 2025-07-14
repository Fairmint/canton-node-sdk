import { createApiOperation } from '../../../../../core';
import { CreateUserParamsSchema, CreateUserParams } from '../../../schemas/operations';
import { CreateUserResponse, CreateUserRequest } from '../../../schemas/api';

/**
 * @description Create a new user on the participant node
 * @example
 * ```typescript
 * const user = await client.createUser({
 *   user: {
 *     id: 'alice',
 *     primaryParty: 'Alice::1220',
 *     isDeactivated: false,
 *     identityProviderId: 'default'
 *   },
 *   rights: [
 *     { kind: { CanActAs: { party: 'Alice::1220' } } }
 *   ]
 * });
 * console.log(`Created user: ${user.user.id}`);
 * ```
 */
export const CreateUser = createApiOperation<
  CreateUserParams,
  CreateUserResponse
>({
  paramsSchema: CreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params: CreateUserParams, apiUrl: string) => `${apiUrl}/v2/users`,
  buildRequestData: (params: CreateUserParams): CreateUserRequest => {
    const requestBody: CreateUserRequest = {
      user: params.user,
    };
    
    if (params.rights) {
      requestBody.rights = params.rights;
    }
    
    return requestBody;
  },
}); 