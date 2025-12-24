import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  cachedAmuletRulesContractId?: string;
}

type Response = operations['getAmuletRules']['responses']['200']['content']['application/json'];

/** Get amulet rules */
export class GetAmuletRules extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/amulet-rules', {
      cached_amulet_rules_contract_id: validated.cachedAmuletRulesContractId,
    });
  }
}
