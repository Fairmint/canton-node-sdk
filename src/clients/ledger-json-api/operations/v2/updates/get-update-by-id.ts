import { createApiOperation } from '../../../../../core';
import { GetUpdateByIdParamsSchema, GetUpdateByIdParams } from '../../../schemas/operations';
import { GetUpdateResponse } from '../../../schemas/api';

/**
 * @description Get update by id
 * @example
 * ```typescript
 * const update = await client.getUpdateById({
 *   updateId: 'update-123',
 *   requestingParties: ['party1', 'party2']
 * });
 * ```
 * @param updateId - ID of the update to fetch
 * @param requestingParties - Optional array of party IDs requesting the update
 */
export const GetUpdateById = createApiOperation<
  GetUpdateByIdParams,
  GetUpdateResponse
>({
  paramsSchema: GetUpdateByIdParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetUpdateByIdParams, apiUrl: string) => `${apiUrl}/v2/updates/update-by-id`,
  buildRequestData: (params: GetUpdateByIdParams, client) => {
    // Get current party ID from client
    const currentPartyId = client.getPartyId();
    
    // Use provided parties or default to empty array
    let requestingParties = params.requestingParties ?? [];
    
    // Ensure current party ID is included
    if (!requestingParties.includes(currentPartyId)) {
      requestingParties.push(currentPartyId);
    }

    // Build request body with simplified format
    const request = {
      updateId: params.updateId,
      requestingParties,
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            verbose: true,
          },
          transactionShape: 'TRANSACTION_SHAPE_UNSPECIFIED',
        },
      },
    };

    return request;
  },
}); 