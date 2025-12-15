import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Maximum number of validator records to return */
  limit: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getTopValidatorsByValidatorFaucets']['responses']['200']['content']['application/json'];

/** Get top validators by validator faucets */
export class GetTopValidatorsByValidatorFaucets extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(`/api/scan/v0/validators/top-validator-faucets?limit=${validated.limit}`);
  }
}
