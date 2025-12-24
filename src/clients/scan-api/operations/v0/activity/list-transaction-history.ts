import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Party ID to get transaction history for */
  partyId: z.string(),
  /** Begin after this cursor (for pagination) */
  beginAfterId: z.string().optional(),
  /** Maximum page size */
  pageSize: z.number().optional(),
  /** Sort order */
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listTransactionHistory']['responses']['200']['content']['application/json'];

/** List transaction history for a party */
export class ListTransactionHistory extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/transaction-history', {
      party_id: validated.partyId,
      begin_after_id: validated.beginAfterId,
      page_size: validated.pageSize,
      sort_order: validated.sortOrder,
    });
  }
}
