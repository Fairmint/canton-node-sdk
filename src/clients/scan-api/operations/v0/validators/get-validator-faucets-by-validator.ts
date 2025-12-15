import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** A list of validator party IDs. Any party IDs not matching onboarded validators will be ignored */
  validatorIds: z.array(z.string()),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getValidatorFaucetsByValidator']['responses']['200']['content']['application/json'];

/** Get validator faucet statistics for specified validators */
export class GetValidatorFaucetsByValidator extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryParams = validated.validatorIds.map((id) => `validator_ids=${encodeURIComponent(id)}`).join('&');
    return this.makeGetRequest<Response>(`/api/scan/v0/validators/validator-faucets?${queryParams}`);
  }
}
