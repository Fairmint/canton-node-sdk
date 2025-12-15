import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Record time for the holdings summary */
  recordTime: z.string(),
  /** Migration ID */
  migrationId: z.number(),
  /** Party ID to get holdings summary for */
  partyId: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getHoldingsSummaryAt']['responses']['200']['content']['application/json'];

/** Get holdings summary at a specific time for a party */
export class GetHoldingsSummaryAt extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/state/holdings-summary', {
      record_time: validated.recordTime,
      migration_id: validated.migrationId,
      party_id: validated.partyId,
    });
  }
}
