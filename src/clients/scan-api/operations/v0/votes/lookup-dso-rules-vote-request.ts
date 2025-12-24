import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Vote request contract ID */
  voteRequestContractId: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupDsoRulesVoteRequest']['responses']['200']['content']['application/json'];

/** Lookup a specific DSO rules vote request by contract ID */
export class LookupDsoRulesVoteRequest extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/dso-rules-vote-requests/${encodeURIComponent(validated.voteRequestContractId)}`
    );
  }
}
