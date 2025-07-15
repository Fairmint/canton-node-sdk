import { createApiOperation } from '../../../../../core';
import { GetAnsRulesResponse } from '../../../schemas/api';
import { GetAnsRulesParamsSchema } from '../../../schemas/operations';

/**
 * @description Get ANS rules for a specific name
 * @example
 * ```typescript
 * const rules = await client.getAnsRules({ name: 'my-app' });
 * console.log(`Rules: ${rules.rules}`);
 * ```
 */
export const GetAnsRules = createApiOperation<
  typeof GetAnsRulesParamsSchema._type,
  GetAnsRulesResponse
>({
  paramsSchema: GetAnsRulesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/ans/rules/${params.name}`,
}); 