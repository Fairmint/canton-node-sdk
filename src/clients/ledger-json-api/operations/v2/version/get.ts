import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type GetLedgerApiVersionResponse } from '../../../schemas/api';

/**
 * Get the version details of the participant node
 *
 * @example
 *   ```typescript
 *   const version = await client.getVersion();
 *   
 *   ```
 */
export const GetVersion = createApiOperation<void, GetLedgerApiVersionResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/v2/version`,
});
