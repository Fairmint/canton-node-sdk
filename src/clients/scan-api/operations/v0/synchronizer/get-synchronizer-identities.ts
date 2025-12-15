import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Domain ID prefix to look up */
  domainIdPrefix: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getSynchronizerIdentities']['responses']['200']['content']['application/json'];

/** Get synchronizer identities by domain ID prefix */
export class GetSynchronizerIdentities extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/synchronizer/identities/${encodeURIComponent(validated.domainIdPrefix)}`
    );
  }
}
