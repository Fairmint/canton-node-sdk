import { createApiOperation } from '../../../../../core';
import { GetTransactionTreeByIdParamsSchema, GetTransactionTreeByIdParams } from '../../../schemas/operations';
import { GetTransactionTreeResponse } from '../../../schemas/api';

/**
 * @description Get transaction tree by id
 * @example
 * ```typescript
 * const transactionTree = await client.getTransactionTreeById({
 *   updateId: 'update-123',
 *   parties: ['party1', 'party2']
 * });
 * ```
 * @param updateId - Update ID to fetch the transaction tree for
 * @param parties - Optional array of party IDs to filter transactions by
 */
export const GetTransactionTreeById = createApiOperation<
  GetTransactionTreeByIdParams,
  GetTransactionTreeResponse
>({
  paramsSchema: GetTransactionTreeByIdParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl, client) => {
    const currentPartyId = client.getPartyId();
    
    const readParties = Array.from(
      new Set([
        currentPartyId,
        ...(params.parties || []),
      ])
    );

    const baseUrl = `${apiUrl}/v2/updates/transaction-tree-by-id/${params.updateId}`;
    
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