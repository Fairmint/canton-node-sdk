import { createApiOperation } from '../../../../../core';
import { GetTransactionByIdParamsSchema, GetTransactionByIdParams } from '../../../schemas/operations';
import { GetTransactionResponse } from '../../../schemas/api';

/**
 * @description Get transaction by id
 * @example
 * ```typescript
 * const transaction = await client.getTransactionById({
 *   updateId: 'transaction-123',
 *   transactionFormat: {
 *     eventFormat: {
 *       filtersByParty: {
 *         'party1': { cumulative: [] }
 *       },
 *       verbose: true
 *     },
 *     transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA'
 *   }
 * });
 * ```
 * @param updateId - ID of the transaction to fetch
 * @param transactionFormat - Transaction format for the request
 */
export const GetTransactionById = createApiOperation<
  GetTransactionByIdParams,
  GetTransactionResponse
>({
  paramsSchema: GetTransactionByIdParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetTransactionByIdParams, apiUrl: string) => `${apiUrl}/v2/updates/transaction-by-id`,
  buildRequestData: (params: GetTransactionByIdParams) => {
    // Build request body
    const request = {
      updateId: params.updateId,
      transactionFormat: params.transactionFormat,
    };

    return request;
  },
}); 