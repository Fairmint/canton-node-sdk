import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z
  .object({
    /** Contract ID to check if still active (for cache efficiency) */
    cachedAnsRulesContractId: z.string().optional(),
  })
  .optional();

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getAnsRules']['responses']['200']['content']['application/json'];

/** Get ANS (Amulet Name Service) rules */
export class GetAnsRules extends ScanApiOperation<Params, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/ans-rules', {
      cached_ans_rules_contract_id: validated.cachedAnsRulesContractId,
    });
  }
}
