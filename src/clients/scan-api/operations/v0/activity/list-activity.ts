import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Party ID to get activity for */
  partyId: z.string(),
  /** Begin after this cursor (for pagination) */
  beginAfterId: z.string().optional(),
  /** Maximum page size */
  pageSize: z.number().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listActivity']['responses']['200']['content']['application/json'];

/** List activity for a party */
export class ListActivity extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/activity', {
      party_id: validated.partyId,
      begin_after_id: validated.beginAfterId,
      page_size: validated.pageSize,
    });
  }
}
