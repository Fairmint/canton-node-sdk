import { createApiOperation } from '../../../../../core';
import { ListAnsEntriesProxyResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description List ANS entries via proxy with optional filtering
 * @example
 * ```typescript
 * const entries = await client.listAnsEntriesProxy({ 
 *   namePrefix: 'my', 
 *   pageSize: 50 
 * });
 * console.log(`Found ${entries.entries.length} entries`);
 * ```
 */
export const ListAnsEntriesProxy = createApiOperation<
  void,
  ListAnsEntriesProxyResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/ans/entries/proxy`,
}); 