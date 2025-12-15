import { type operations } from '../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['getHealthStatus']['responses']['200']['content']['application/json'];

/** Get health status of the scan API */
export class GetHealthStatus extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/status');
  }
}
