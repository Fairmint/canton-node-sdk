import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Date before which to find the most recent snapshot */
  before: z.string(),
  /** Migration ID */
  migrationId: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getDateOfMostRecentSnapshotBefore']['responses']['200']['content']['application/json'];

/** Get the timestamp of the most recent snapshot before a given date */
export class GetDateOfMostRecentSnapshotBefore extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/state/acs/snapshot-timestamp?before=${encodeURIComponent(validated.before)}&migration_id=${validated.migrationId}`
    );
  }
}
