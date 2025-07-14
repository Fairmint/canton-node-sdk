import { createApiOperation } from '../../../../../core';
import { ListKnownPartiesParamsSchema, ListKnownPartiesParams } from '../../../schemas/operations';
import { ListKnownPartiesResponse } from '../../../schemas/api';

/**
 * @description List all known parties
 * @example
 * ```typescript
 * const parties = await client.listKnownParties({ pageSize: 10 });
 * console.log(`Found ${parties.partyDetails.length} parties`);
 * ```
 */
export const ListKnownParties = createApiOperation<
  ListKnownPartiesParams,
  ListKnownPartiesResponse
>({
  paramsSchema: ListKnownPartiesParamsSchema,
  method: 'GET',
  buildUrl: (params: ListKnownPartiesParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/parties`);
    if (params.pageSize !== undefined) {
      url.searchParams.set('pageSize', params.pageSize.toString());
    }
    if (params.pageToken !== undefined) {
      url.searchParams.set('pageToken', params.pageToken);
    }
    return url.toString();
  },
}); 