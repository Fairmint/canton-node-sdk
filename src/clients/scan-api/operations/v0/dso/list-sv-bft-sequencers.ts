import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['listSvBftSequencers']['responses']['200']['content']['application/json'];

/** Retrieve Canton BFT sequencer configuration for this SV, for each configured Synchronizer */
export class ListSvBftSequencers extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/sv-bft-sequencers');
  }
}
