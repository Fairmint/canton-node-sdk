import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** The synchronizer ID to look up traffic for */
  domainId: z.string(),
  /** The participant or mediator whose traffic to look up, in format `code::id::fingerprint` where `code` is `PAR` or `MED` */
  memberId: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getMemberTrafficStatus']['responses']['200']['content']['application/json'];

/** Get a member's traffic status as reported by the sequencer */
export class GetMemberTrafficStatus extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const path = `/api/scan/v0/domains/${encodeURIComponent(validated.domainId)}/members/${encodeURIComponent(validated.memberId)}/traffic-status`;
    return this.makeGetRequest<Response>(path);
  }
}
