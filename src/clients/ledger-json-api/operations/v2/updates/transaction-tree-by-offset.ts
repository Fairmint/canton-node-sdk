import { createApiOperation, ApiOperation } from '../../../../../core';
import { GetTransactionTreeByOffsetParamsSchema, GetTransactionTreeByOffsetParams, TransactionTreeByOffsetResponse } from '../../../schemas';

export const GetTransactionTreeByOffset = createApiOperation<
  GetTransactionTreeByOffsetParams,
  TransactionTreeByOffsetResponse
>({
  paramsSchema: GetTransactionTreeByOffsetParamsSchema,
  operation: 'get transaction tree by offset',
  method: 'GET',
  buildUrl: function(
    this: ApiOperation<GetTransactionTreeByOffsetParams, TransactionTreeByOffsetResponse>,
    params: GetTransactionTreeByOffsetParams,
    apiUrl: string
  ) {
    const currentPartyId = this.getPartyId();
    
    const readParties = Array.from(
      new Set([
        ...(currentPartyId ? [currentPartyId] : []),
        ...(params.parties || []),
      ])
    ).filter((party): party is string => party !== undefined);

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