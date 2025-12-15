import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['getClosedRounds']['responses']['200']['content']['application/json'];

/** Get every closed mining round on the ledger still in post-close process */
export class GetClosedRounds extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/closed-rounds');
  }
}
