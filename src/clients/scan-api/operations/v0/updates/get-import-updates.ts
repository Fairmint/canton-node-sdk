import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** After record time */
  afterRecordTime: z.string().optional(),
  /** After migration ID */
  afterMigrationId: z.number().optional(),
  /** Maximum page size */
  pageSize: z.number().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getImportUpdates']['responses']['200']['content']['application/json'];

/** Get import updates */
export class GetImportUpdates extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/import-updates', {
      after_record_time: validated.afterRecordTime,
      after_migration_id: validated.afterMigrationId,
      page_size: validated.pageSize,
    });
  }
}
