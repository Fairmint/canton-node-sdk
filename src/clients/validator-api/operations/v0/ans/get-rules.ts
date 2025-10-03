import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

// Create Zod schema for the request parameters
const GetAnsRulesParamsSchema = z.object({
  cached_ans_rules_contract_id: z.string().optional(),
  cached_ans_rules_domain_id: z.string().optional(),
});

/**
 * Get ANS rules
 *
 * @example
 *   ```typescript
 *   const rules = await client.getAnsRules({
 *   cached_ans_rules_contract_id: 'contract123',
 *   cached_ans_rules_domain_id: 'domain123'
 *   });
 *   
 *   ```
 */
export const GetAnsRules = createApiOperation<
  operations['getAnsRules']['requestBody']['content']['application/json'],
  operations['getAnsRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAnsRulesParamsSchema as z.ZodType<operations['getAnsRules']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/ans-rules`,
  buildRequestData: (params) => params,
});
