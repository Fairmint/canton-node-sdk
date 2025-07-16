import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { ListKnownPartiesResponse } from '../../../schemas/api';

// Schema for the parameters
export const ListKnownPartiesParamsSchema = z.object({
  /** Maximum number of elements in a returned page */
  pageSize: z.number().int().optional(),
  /** Token to continue results from a given page */
  pageToken: z.string().optional(),
});

export type ListKnownPartiesParams = z.infer<typeof ListKnownPartiesParamsSchema>;

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