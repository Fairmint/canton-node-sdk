import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  actionName?: string;
  accepted?: boolean;
  requirer?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  limit?: number;
}

type Response = operations['listVoteRequestResults']['responses']['200']['content']['application/json'];

/** List vote request results with optional filters */
export class ListVoteRequestResults extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/dso-rules-vote-results', {
      action_name: validated.actionName,
      accepted: validated.accepted,
      requirer: validated.requirer,
      effective_from: validated.effectiveFrom,
      effective_to: validated.effectiveTo,
      limit: validated.limit,
    });
  }
}
