import { createApiOperation } from '../../../../../core';
import { GetTransactionByOffsetParamsSchema, GetTransactionByOffsetParams } from '../../../schemas/operations';
import { GetTransactionResponse } from '../../../schemas/api';

/**
 * @description Get transaction by offset
 * @example
 * ```typescript
 * const transaction = await client.getTransactionByOffset({
 *   offset: 1000,
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
 * @param offset - Offset of the transaction being looked up
 * @param transactionFormat - Transaction format for the request
 */
export const GetTransactionByOffset = createApiOperation<
  GetTransactionByOffsetParams,
  GetTransactionResponse
>({
  paramsSchema: GetTransactionByOffsetParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetTransactionByOffsetParams, apiUrl: string) => `${apiUrl}/v2/updates/transaction-by-offset`,
  buildRequestData: (params: GetTransactionByOffsetParams) => {
    const request: GetTransactionByOffsetParams = {
      offset: params.offset,
      transactionFormat: params.transactionFormat,
    };

    return request;
  },
}); 