import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['listAmuletPriceVotes']['responses']['200']['content']['application/json'];

/** List all amulet price votes */
export class ListAmuletPriceVotes extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/amulet-price-votes');
  }
}
