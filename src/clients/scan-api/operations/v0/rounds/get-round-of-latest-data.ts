import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['getRoundOfLatestData']['responses']['200']['content']['application/json'];

/** Get the round number of the latest available data */
export class GetRoundOfLatestData extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/round-of-latest-data');
  }
}
