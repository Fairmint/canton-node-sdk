import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

type GetAnsRulesRequest = operations['getAnsRules']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated ANS-rules request. */
export const GetAnsRulesParamsSchema = createRequestSchema<GetAnsRulesRequest>()({
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
 *   ```;
 */
export const GetAnsRules = createApiOperation<
  GetAnsRulesRequest,
  operations['getAnsRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAnsRulesParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/ans-rules`,
  buildRequestData: (params) => params,
});
