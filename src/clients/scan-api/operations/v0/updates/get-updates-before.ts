import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Before record time */
  beforeRecordTime: z.string(),
  /** Migration ID */
  migrationId: z.number(),
  /** Maximum page size */
  pageSize: z.number().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getUpdatesBefore']['responses']['200']['content']['application/json'];

/** Get updates before a specific time */
export class GetUpdatesBefore extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/updates-before', {
      before_record_time: validated.beforeRecordTime,
      migration_id: validated.migrationId,
      page_size: validated.pageSize,
    });
  }
}
