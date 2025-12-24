import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Round number */
  round: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getAmuletConfigForRound']['responses']['200']['content']['application/json'];

/** Get amulet configuration for a specific round */
export class GetAmuletConfigForRound extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(`/api/scan/v0/amulet-config?round=${validated.round}`);
  }
}
