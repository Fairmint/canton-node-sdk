import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['listFeaturedAppRights']['responses']['200']['content']['application/json'];

/** List all featured app rights */
export class ListFeaturedAppRights extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/featured-app-rights');
  }
}
