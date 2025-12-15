import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  round?: number;
}

type Response = operations['getRewardsCollected']['responses']['200']['content']['application/json'];

/** Get rewards collected, optionally for a specific round */
export class GetRewardsCollected extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    const queryString = validated.round !== undefined ? `?round=${validated.round}` : '';
    return this.makeGetRequest<Response>(`/api/scan/v0/rewards-collected${queryString}`);
  }
}
