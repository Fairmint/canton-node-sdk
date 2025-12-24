import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Start round (inclusive) */
  startRound: z.number(),
  /** End round (inclusive) */
  endRound: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listRoundTotals']['responses']['200']['content']['application/json'];

/** List round totals for a range of rounds */
export class ListRoundTotals extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/round-totals', {
      start_round: validated.startRound,
      end_round: validated.endRound,
    });
  }
}
