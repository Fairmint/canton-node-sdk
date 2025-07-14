import { createApiOperation } from '../../../../../core';
import { ListUserRightsParamsSchema, ListUserRightsParams } from '../../../schemas/operations';
import { ListUserRightsResponse } from '../../../schemas/api';

/**
 * @description List all rights for a specific user
 * @example
 * ```typescript
 * const rights = await client.listUserRights({ userId: 'alice' });
 * console.log(`User has ${rights.rights.length} rights`);
 * ```
 */
export const ListUserRights = createApiOperation<
  ListUserRightsParams,
  ListUserRightsResponse
>({
  paramsSchema: ListUserRightsParamsSchema,
  method: 'GET',
  buildUrl: (params: ListUserRightsParams, apiUrl: string) => `${apiUrl}/v2/users/${params.userId}/rights`,
}); 