import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Round number to get balance at end of */
  asOfEndOfRound: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getTotalAmuletBalance']['responses']['200']['content']['application/json'];

/** Get total amulet balance as of the end of a specific round */
export class GetTotalAmuletBalance extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(`/api/scan/v0/total-amulet-balance?asOfEndOfRound=${validated.asOfEndOfRound}`);
  }
}
