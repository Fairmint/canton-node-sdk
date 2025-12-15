import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  cachedOpenMiningRoundContractIds?: string[];
  cachedIssuingMiningRoundContractIds?: string[];
}

type Response = operations['getOpenAndIssuingMiningRounds']['responses']['200']['content']['application/json'];

/** Get all current open and issuing mining rounds */
export class GetOpenAndIssuingMiningRounds extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/open-and-issuing-mining-rounds', {
      cached_open_mining_round_contract_ids: validated.cachedOpenMiningRoundContractIds ?? [],
      cached_issuing_mining_round_contract_ids: validated.cachedIssuingMiningRoundContractIds ?? [],
    });
  }
}
