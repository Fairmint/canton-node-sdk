import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Record time for the holdings state */
  recordTime: z.string(),
  /** Migration ID */
  migrationId: z.number(),
  /** Party ID to get holdings for */
  partyId: z.string(),
  /** After cursor for pagination */
  after: z.string().optional(),
  /** Maximum page size */
  pageSize: z.number().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getHoldingsStateAt']['responses']['200']['content']['application/json'];

/** Get holdings state at a specific time for a party */
export class GetHoldingsStateAt extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/state/holdings', {
      record_time: validated.recordTime,
      migration_id: validated.migrationId,
      party_id: validated.partyId,
      after: validated.after,
      page_size: validated.pageSize,
    });
  }
}
