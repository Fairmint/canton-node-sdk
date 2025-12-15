import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Tracking contract IDs to look up */
  voteRequestTrackingCids: z.array(z.string()),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listVoteRequestsByTrackingCid']['responses']['200']['content']['application/json'];

/** List vote requests by tracking contract IDs */
export class ListVoteRequestsByTrackingCid extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/votes/request-by-tracking-cid', {
      vote_request_tracking_cids: validated.voteRequestTrackingCids,
    });
  }
}
