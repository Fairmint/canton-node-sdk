import { createApiOperation } from '../../../core/operations/ApiOperationFactory';
import { GetTransactionTreeByOffsetParamsSchema, GetTransactionTreeByOffsetParams } from '../schemas';
import { TransactionTreeByOffsetResponse } from '../schemas/transactions';

export const GetTransactionTreeByOffset = createApiOperation<
  GetTransactionTreeByOffsetParams,
  TransactionTreeByOffsetResponse
>({
  paramsSchema: GetTransactionTreeByOffsetParamsSchema,
  operation: 'get transaction tree by offset',
  method: 'POST',
  buildUrl: () => '/transactions/transaction-trees-by-offset',
  buildRequestData: (params) => ({
    offset: params.offset,
    parties: params.parties,
  }),
  transformResponse: (response) => {
    if (!response) {
      throw new Error('No response received');
    }
    return response;
  },
}); 