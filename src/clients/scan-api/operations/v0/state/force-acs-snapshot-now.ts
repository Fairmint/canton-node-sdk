import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['forceAcsSnapshotNow']['responses']['200']['content']['application/json'];

/** Force creation of an ACS snapshot immediately */
export class ForceAcsSnapshotNow extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makePostRequest<Response>('/api/scan/v0/state/acs/force-snapshot-now', {});
  }
}
