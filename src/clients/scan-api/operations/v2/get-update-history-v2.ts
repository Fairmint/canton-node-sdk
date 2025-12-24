import { type operations } from '../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../ScanApiOperation';

interface Params {
  afterRecordTime?: string;
  afterMigrationId?: number;
  pageSize?: number;
  templateIds?: string[];
}

type Response = operations['getUpdateHistoryV2']['responses']['200']['content']['application/json'];

/** Get update history (v2 - recommended) */
export class GetUpdateHistoryV2 extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v2/updates', {
      after_record_time: validated.afterRecordTime,
      after_migration_id: validated.afterMigrationId,
      page_size: validated.pageSize,
      template_ids: validated.templateIds,
    });
  }
}
