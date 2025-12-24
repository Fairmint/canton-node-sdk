import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Party ID to lookup transfer command counter for */
  party: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupTransferCommandCounterByParty']['responses']['200']['content']['application/json'];

/** Lookup transfer command counter by party. If 404, the nonce should be 0. */
export class LookupTransferCommandCounterByParty extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/transfer-command-counter/by-party/${encodeURIComponent(validated.party)}`
    );
  }
}
