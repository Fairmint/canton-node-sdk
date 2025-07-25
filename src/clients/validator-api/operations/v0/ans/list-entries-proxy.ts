import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { operations } from '../../../../../generated/apps/validator/src/main/openapi/ans-external';

/**
 * @description List ANS entries
 * @example
 * ```typescript
 * const entries = await client.listAnsEntries();
 * console.log(`Found ${entries.entries.length} entries`);
 * ```
 */
export const ListAnsEntries = createApiOperation<
  void,
  operations['listAnsEntries']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/entry/all`,
}); 