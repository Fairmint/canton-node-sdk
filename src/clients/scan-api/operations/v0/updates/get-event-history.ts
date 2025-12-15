import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z
  .object({
    /** After record time */
    afterRecordTime: z.string().optional(),
    /** After migration ID */
    afterMigrationId: z.number().optional(),
    /** Maximum page size */
    pageSize: z.number().optional(),
    /** Template IDs to filter by */
    templateIds: z.array(z.string()).optional(),
  })
  .optional();

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getEventHistory']['responses']['200']['content']['application/json'];

/** Get event history */
export class GetEventHistory extends ScanApiOperation<Params, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/events', {
      after_record_time: validated.afterRecordTime,
      after_migration_id: validated.afterMigrationId,
      page_size: validated.pageSize,
      template_ids: validated.templateIds,
    });
  }
}
