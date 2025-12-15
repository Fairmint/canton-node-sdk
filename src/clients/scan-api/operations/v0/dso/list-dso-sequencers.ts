import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['listDsoSequencers']['responses']['200']['content']['application/json'];

/** Retrieve Canton sequencer configuration for all SVs, grouped by connected synchronizer ID */
export class ListDsoSequencers extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/dso-sequencers');
  }
}
