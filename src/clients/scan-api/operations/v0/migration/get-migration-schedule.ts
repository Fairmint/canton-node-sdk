import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';



type Params = Record<string, never> | undefined;
type Response = operations['getMigrationSchedule']['responses']['200']['content']['application/json'];

/** Get the current migration schedule */
export class GetMigrationSchedule extends ScanApiOperation<Params, Response> {
  async execute(_params?: Params): Promise<Response> {
    return this.makeGetRequest<Response>('/api/scan/v0/migration-schedule');
  }
}
