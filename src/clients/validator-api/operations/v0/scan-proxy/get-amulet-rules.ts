import { createApiOperation } from '../../../../../core';
import { GetAmuletRulesResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description Get amulet rules
 * @example
 * ```typescript
 * const rules = await client.getAmuletRules();
 * console.log(`Domain ID: ${rules.amulet_rules.domain_id}`);
 * ```
 */
export const GetAmuletRules = createApiOperation<
  void,
  GetAmuletRulesResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/amulet-rules`,
}); 