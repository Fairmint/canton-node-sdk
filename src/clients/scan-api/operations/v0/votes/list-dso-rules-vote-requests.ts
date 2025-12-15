import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['listDsoRulesVoteRequests']['responses']['200']['content']['application/json'];

/** List all DSO rules vote requests */
export class ListDsoRulesVoteRequests extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/dso-rules-vote-requests');
  }
}
