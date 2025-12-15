import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z
  .object({
    /** Contract ID to check if still active (for cache efficiency) */
    cachedExternalPartyAmuletRulesContractId: z.string().optional(),
  })
  .optional();

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getExternalPartyAmuletRules']['responses']['200']['content']['application/json'];

/** Get external party amulet rules */
export class GetExternalPartyAmuletRules extends ScanApiOperation<Params, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/external-party-amulet-rules', {
      cached_external_party_amulet_rules_contract_id: validated.cachedExternalPartyAmuletRulesContractId,
    });
  }
}
