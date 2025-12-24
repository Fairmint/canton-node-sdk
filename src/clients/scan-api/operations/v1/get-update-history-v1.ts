import { type operations } from '../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../ScanApiOperation';

interface Params {
  afterRecordTime?: string;
  afterMigrationId?: number;
  pageSize?: number;
}

type Response = operations['getUpdateHistoryV1']['responses']['200']['content']['application/json'];

/**
 * Get update history (v1 - deprecated)
 * @deprecated Use v2 endpoint instead
 */
export class GetUpdateHistoryV1 extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v1/updates', {
      after_record_time: validated.afterRecordTime,
      after_migration_id: validated.afterMigrationId,
      page_size: validated.pageSize,
    });
  }
}
