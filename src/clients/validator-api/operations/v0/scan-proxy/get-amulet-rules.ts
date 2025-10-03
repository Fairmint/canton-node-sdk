import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

/**
 * Get amulet rules
 *
 * @example
 *   ```typescript
 *   const rules = await client.getAmuletRules();
 *
 *   ```;
 */
export const GetAmuletRules = createApiOperation<
  void,
  operations['getAmuletRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/amulet-rules`,
});
