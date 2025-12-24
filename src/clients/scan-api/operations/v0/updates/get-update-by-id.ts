import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Update ID to look up */
  updateId: z.string(),
  /** Use lossless encoding for contract payload */
  lossless: z.boolean().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getUpdateById']['responses']['200']['content']['application/json'];

/** Get update by ID (v0 - deprecated) */
export class GetUpdateById extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryString = validated.lossless !== undefined ? `?lossless=${validated.lossless}` : '';
    return this.makeGetRequest<Response>(
      `/api/scan/v0/updates/${encodeURIComponent(validated.updateId)}${queryString}`
    );
  }
}
