import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  migrationId?: number;
}

type Response = operations['getMigrationInfo']['responses']['200']['content']['application/json'];

/** Get migration information */
export class GetMigrationInfo extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/migration-info', {
      migration_id: validated.migrationId,
    });
  }
}
