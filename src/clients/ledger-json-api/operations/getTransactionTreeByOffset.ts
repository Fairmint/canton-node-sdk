import { createApiOperation } from '../../../core/operations/ApiOperationFactory';
import { GetTransactionTreeByOffsetParamsSchema, GetTransactionTreeByOffsetParams } from '../schemas';
import { TransactionTreeByOffsetResponse } from '../schemas/transactions';
import { EnvironmentConfig } from '../../../core/config/EnvironmentConfig';

export const GetTransactionTreeByOffset = createApiOperation<
  GetTransactionTreeByOffsetParams,
  TransactionTreeByOffsetResponse
>({
  paramsSchema: GetTransactionTreeByOffsetParamsSchema,
  operation: 'get transaction tree by offset',
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const config = EnvironmentConfig.getInstance();
    const currentPartyId = config.getPartyId();
    
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