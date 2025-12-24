import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Record time for the snapshot */
  recordTime: z.string(),
  /** Migration ID */
  migrationId: z.number(),
  /** After cursor for pagination */
  after: z.string().optional(),
  /** Maximum page size */
  pageSize: z.number().optional(),
  /** Template IDs to filter by */
  templateIds: z.array(z.string()).optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getAcsSnapshotAt']['responses']['200']['content']['application/json'];

/** Get ACS (Active Contract Set) snapshot at a specific time */
export class GetAcsSnapshotAt extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makePostRequest<Response>('/api/scan/v0/state/acs', {
      record_time: validated.recordTime,
      migration_id: validated.migrationId,
      after: validated.after,
      page_size: validated.pageSize,
      template_ids: validated.templateIds,
    });
  }
}
