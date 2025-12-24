import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

type Params = Record<string, never> | undefined;
type Response = operations['featureSupport']['responses']['200']['content']['application/json'];

/** Get feature support information */
export class FeatureSupport extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/feature-support');
  }
}
