import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z
  .object({
    /** Migration ID to get info for */
    migrationId: z.number().optional(),
  })
  .optional();

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getMigrationInfo']['responses']['200']['content']['application/json'];

/** Get migration information */
export class GetMigrationInfo extends ScanApiOperation<Params, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/migration-info', {
      migration_id: validated.migrationId,
    });
  }
}
