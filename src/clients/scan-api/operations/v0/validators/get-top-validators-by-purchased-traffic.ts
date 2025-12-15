import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Round number */
  round: z.number(),
  /** Maximum number of validator records to return */
  limit: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getTopValidatorsByPurchasedTraffic']['responses']['200']['content']['application/json'];

/** Get top validators by purchased traffic for a specific round */
export class GetTopValidatorsByPurchasedTraffic extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/validators/top-purchased-traffic?round=${validated.round}&limit=${validated.limit}`
    );
  }
}
