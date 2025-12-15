import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['getAggregatedRounds']['responses']['200']['content']['application/json'];

/** Get aggregated rounds information */
export class GetAggregatedRounds extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/aggregated-rounds');
  }
}
