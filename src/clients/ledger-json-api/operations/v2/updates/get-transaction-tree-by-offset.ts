import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';

const endpoint = '/v2/updates/transaction-tree-by-offset/{offset}';

export const GetTransactionTreeByOffsetParamsSchema = z.object({
  offset: z.string(),
  verbose: z.boolean().optional(),
  parties: z.array(z.string()).optional(),
});

export type GetTransactionTreeByOffsetParams = z.infer<typeof GetTransactionTreeByOffsetParamsSchema>;
export type GetTransactionTreeByOffsetResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * @description Retrieves transaction tree data starting from a specific offset
 * @example
 * ```typescript
 * const transactionTree = await client.getTransactionTreeByOffset({
 *   offset: '1000',
 *   parties: ['party1', 'party2']
 * });
 * ```
 * @param offset - The starting offset for transaction retrieval
 * @param parties - Optional array of party IDs to filter transactions by
 */
export const GetTransactionTreeByOffset = createApiOperation<
  GetTransactionTreeByOffsetParams,
  GetTransactionTreeByOffsetResponse
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

    const baseUrl = `${apiUrl}${endpoint.replace('{offset}', params.offset)}`;
    
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