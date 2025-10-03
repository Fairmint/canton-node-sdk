import { createApiOperation } from '../../../../../core';
import { type InteractiveSubmissionCreateUserResponse } from '../../../schemas/api';
import {
  InteractiveSubmissionCreateUserParamsSchema,
  type InteractiveSubmissionCreateUserParams,
} from '../../../schemas/operations';

/**
 * Create user interactively
 *
 * @example
 *   ```typescript
 *   const result = await client.interactiveSubmissionCreateUser({
 *   user: {
 *   id: 'alice',
 *   primaryParty: 'Alice::1220',
 *   isDeactivated: false,
 *   identityProviderId: 'default'
 *   },
 *   rights: [
 *   { kind: { CanActAs: { party: 'Alice::1220' } } }
 *   ]
 *   });
 *
 *   ```;
 */
export const InteractiveSubmissionCreateUser = createApiOperation<
  InteractiveSubmissionCreateUserParams,
  InteractiveSubmissionCreateUserResponse
>({
  paramsSchema: InteractiveSubmissionCreateUserParamsSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionCreateUserParams, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/create-user`,
  buildRequestData: (params: InteractiveSubmissionCreateUserParams) => ({
    user: params.user,
    rights: params.rights,
  }),
});
