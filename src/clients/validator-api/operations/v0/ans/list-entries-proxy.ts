import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/ans-external';

/**
 * List ANS entries
 *
 * @example
 *   ```typescript
 *   const entries = await client.listAnsEntries();
 *
 *   ```;
 */
export const ListAnsEntries = createApiOperation<
  void,
  operations['listAnsEntries']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/entry/all`,
});
