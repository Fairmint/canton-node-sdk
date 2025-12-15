import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  afterRecordTime?: string;
  afterMigrationId?: number;
  pageSize?: number;
}

type Response = operations['getUpdateHistory']['responses']['200']['content']['application/json'];

/** Get update history (v0 - deprecated) */
export class GetUpdateHistory extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/updates', {
      after_record_time: validated.afterRecordTime,
      after_migration_id: validated.afterMigrationId,
      page_size: validated.pageSize,
    });
  }
}
