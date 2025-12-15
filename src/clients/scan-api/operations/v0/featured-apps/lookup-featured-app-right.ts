import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Provider party ID to lookup */
  providerPartyId: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupFeaturedAppRight']['responses']['200']['content']['application/json'];

/** Lookup featured app right by provider party ID */
export class LookupFeaturedAppRight extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/featured-app-rights/${encodeURIComponent(validated.providerPartyId)}`
    );
  }
}
