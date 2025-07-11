import { createApiOperation } from '../../../../../core';
import { GetUpdateByOffsetParamsSchema, GetUpdateByOffsetParams } from '../../../schemas/operations';
import { GetUpdateResponse } from '../../../schemas/api';

/**
 * @description Get update by offset
 * @example
 * ```typescript
 * const update = await client.getUpdateByOffset({
 *   offset: 1000,
 *   updateFormat: {
 *     includeTransactions: {
 *       eventFormat: {
 *         filtersByParty: {
 *           'party1': { cumulative: [] }
 *         },
 *         verbose: true
 *       },
 *       transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA'
 *     }
 *   }
 * });
 * ```
 * @param offset - Offset of the update being looked up
 * @param updateFormat - Update format for the request
 */
export const GetUpdateByOffset = createApiOperation<
  GetUpdateByOffsetParams,
  GetUpdateResponse
>({
  paramsSchema: GetUpdateByOffsetParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetUpdateByOffsetParams, apiUrl: string) => `${apiUrl}/v2/updates/update-by-offset`,
  buildRequestData: (params: GetUpdateByOffsetParams) => {
    // Build request body
    const request = {
      offset: params.offset,
      updateFormat: params.updateFormat,
    };

    return request;
  },
}); 