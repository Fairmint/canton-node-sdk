import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Round number */
  round: z.number(),
  /** Maximum number of records to return */
  limit: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getTopProvidersByAppRewards']['responses']['200']['content']['application/json'];

/** Get top providers by app rewards for a specific round */
export class GetTopProvidersByAppRewards extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/providers/top-app-rewards?round=${validated.round}&limit=${validated.limit}`
    );
  }
}
