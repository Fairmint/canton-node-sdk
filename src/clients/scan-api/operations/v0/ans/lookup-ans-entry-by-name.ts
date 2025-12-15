import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** The ANS entry name to look up */
  name: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupAnsEntryByName']['responses']['200']['content']['application/json'];

/** Lookup an ANS entry by name */
export class LookupAnsEntryByName extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(`/api/scan/v0/ans-entries/by-name/${encodeURIComponent(validated.name)}`);
  }
}
