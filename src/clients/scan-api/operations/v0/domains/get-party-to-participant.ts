import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** The synchronizer ID to look up a mapping for */
  domainId: z.string(),
  /** The party ID to lookup a participant ID for */
  partyId: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getPartyToParticipant']['responses']['200']['content']['application/json'];

/** Get the ID of the participant hosting a given party */
export class GetPartyToParticipant extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const path = `/api/scan/v0/domains/${encodeURIComponent(validated.domainId)}/parties/${encodeURIComponent(validated.partyId)}/participant-id`;
    return this.makeGetRequest<Response>(path);
  }
}
