import { createApiOperation } from '../../../../../core';
import { GetUpdateByIdParamsSchema, GetUpdateByIdParams } from '../../../schemas/operations';
import { GetUpdateResponse } from '../../../schemas/api';

/**
 * @description Get update by id
 * @example
 * ```typescript
 * const update = await client.getUpdateById({
 *   updateId: 'update-123',
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
 * @param updateId - ID of the update to fetch
 * @param updateFormat - Update format for the request
 */
export const GetUpdateById = createApiOperation<
  GetUpdateByIdParams,
  GetUpdateResponse
>({
  paramsSchema: GetUpdateByIdParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetUpdateByIdParams, apiUrl: string) => `${apiUrl}/v2/updates/update-by-id`,
  buildRequestData: (params: GetUpdateByIdParams) => {
    // Build request body
    const request = {
      updateId: params.updateId,
      updateFormat: params.updateFormat,
    };

    return request;
  },
}); 