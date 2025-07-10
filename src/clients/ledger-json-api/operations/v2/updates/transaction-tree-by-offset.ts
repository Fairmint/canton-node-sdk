import { createApiOperation } from '../../../../../core';
import { GetTransactionTreeByOffsetParamsSchema, GetTransactionTreeByOffsetParams } from '../../../schemas/operations';
import { TransactionTreeByOffsetResponse } from '../../../schemas/api';

/**
 * @description Retrieves transaction tree data starting from a specific offset
 * @example
 * ```typescript
 * const transactionTree = await client.getTransactionTreeByOffset({
 *   offset: 1000,
 *   parties: ['party1', 'party2']
 * });
 * ```
 * @param offset - The starting offset for transaction retrieval
 * @param parties - Optional array of party IDs to filter transactions by
 */
export const GetTransactionTreeByOffset = createApiOperation<
  GetTransactionTreeByOffsetParams,
  TransactionTreeByOffsetResponse
>({
  paramsSchema: GetTransactionTreeByOffsetParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl, client) => {
    const currentPartyId = client.getPartyId();
    
    const readParties = Array.from(
      new Set([
        currentPartyId,
        ...(params.parties || []),
      ])
    );

    const baseUrl = `${apiUrl}/v2/updates/transaction-tree-by-offset/${params.offset}`;
    
    if (readParties.length > 0) {
      const queryParams = new URLSearchParams();
      readParties.forEach(party => {
        queryParams.append('parties', party);
      });
      return `${baseUrl}?${queryParams.toString()}`;
    }
    
    return baseUrl;
  },
}); 