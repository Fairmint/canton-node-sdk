import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/transaction-tree-by-id/{update-id}';

export const GetTransactionTreeByIdParamsSchema = z.object({
  updateId: z.string(),
  verbose: z.boolean().optional(),
  parties: z.array(z.string()).optional(),
});

export type GetTransactionTreeByIdParams = z.infer<typeof GetTransactionTreeByIdParamsSchema>;
export type GetTransactionTreeByIdResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * @description Retrieves transaction tree data by update ID
 * @example
 * ```typescript
 * const transactionTree = await client.getTransactionTreeById({
 *   updateId: '1220d01cce13fa797bad7de3ea61e919b20dce545d41f05e026ec4b65f1a61c71215',
 *   parties: ['party1', 'party2']
 * });
 * ```
 * @param updateId - The update ID to retrieve transaction tree for
 * @param parties - Optional array of party IDs to filter transactions by
 */
export const GetTransactionTreeById = createApiOperation<
  GetTransactionTreeByIdParams,
  GetTransactionTreeByIdResponse
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

    const baseUrl = `${apiUrl}${endpoint.replace('{update-id}', params.updateId)}`;
    
    const queryParams = new URLSearchParams();
    
    if (readParties.length > 0) {
      readParties.forEach(party => {
        queryParams.append('parties', party);
      });
    }
    
    if (params.verbose) {
      queryParams.set('verbose', params.verbose.toString());
    }
    
    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
}); 