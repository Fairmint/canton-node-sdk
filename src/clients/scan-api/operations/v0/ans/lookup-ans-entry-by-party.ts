import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** The user party ID that holds the ANS entry */
  party: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupAnsEntryByParty']['responses']['200']['content']['application/json'];

/** Lookup an ANS entry by party ID */
export class LookupAnsEntryByParty extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(`/api/scan/v0/ans-entries/by-party/${encodeURIComponent(validated.party)}`);
  }
}
