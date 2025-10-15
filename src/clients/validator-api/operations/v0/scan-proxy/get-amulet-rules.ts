import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type GetAmuletRulesResponse } from '../../../schemas/api/scan-proxy';

/**
 * Get amulet rules
 *
 * @example
 *   ```typescript
 *   const rules = await client.getAmuletRules();
 *
 *   ```;
 */
export const GetAmuletRules = createApiOperation<void, GetAmuletRulesResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/amulet-rules`,
});
