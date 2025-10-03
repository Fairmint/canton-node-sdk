import { createApiOperation } from '../../../../../core';
import { type GetUpdateTreesResponse } from '../../../schemas/api';
import { GetUpdateTreesParamsSchema, type GetUpdateTreesParams } from '../../../schemas/operations';

/**
 * Query update transactions tree list (blocking call)
 *
 * @example
 *   ```typescript
 *   const updateTrees = await client.getUpdateTrees({
 *     beginExclusive: 1000,
 *     endInclusive: 2000,
 *     limit: 100,
 *     streamIdleTimeoutMs: 5000,
 *     updateFormat: {
 *       includeTransactions: {
 *         eventFormat: {
 *           filtersByParty: {
 *             'party1': { cumulative: [] }
 *           },
 *           verbose: true
 *         },
 *         transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA'
 *       }
 *     }
 *   });
 *   ```;
 *
 * @param beginExclusive - Beginning of the requested ledger section (non-negative integer)
 * @param endInclusive - End of the requested ledger section (optional)
 * @param limit - Maximum number of elements to return (optional)
 * @param streamIdleTimeoutMs - Timeout to complete and send result if no new elements are received (optional)
 * @param updateFormat - Update format for the request
 */
export const GetUpdateTrees = createApiOperation<GetUpdateTreesParams, GetUpdateTreesResponse>({
  paramsSchema: GetUpdateTreesParamsSchema,
  method: 'POST',
  buildUrl: (params: GetUpdateTreesParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/updates/trees`;
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params.streamIdleTimeoutMs !== undefined) {
      queryParams.append('stream_idle_timeout_ms', params.streamIdleTimeoutMs.toString());
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
  buildRequestData: (params: GetUpdateTreesParams) => {
    // Build request body
    const request = {
      beginExclusive: params.beginExclusive,
      endInclusive: params.endInclusive,
      updateFormat: params.updateFormat,
    };

    return request;
  },
});
