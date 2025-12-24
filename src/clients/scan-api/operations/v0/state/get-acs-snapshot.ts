import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Party ID to get ACS snapshot for */
  party: z.string(),
  /** Record time for the snapshot (optional) */
  recordTime: z.string().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getAcsSnapshot']['responses']['200']['content']['application/json'];

/** Get ACS snapshot for a party */
export class GetAcsSnapshot extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryString = validated.recordTime ? `?record_time=${encodeURIComponent(validated.recordTime)}` : '';
    return this.makeGetRequest<Response>(
      `/api/scan/v0/acs-snapshot/${encodeURIComponent(validated.party)}${queryString}`
    );
  }
}
