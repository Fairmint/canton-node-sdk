import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Party ID to get wallet balance for */
  partyId: z.string(),
  /** Round number to get balance at end of */
  asOfEndOfRound: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getWalletBalance']['responses']['200']['content']['application/json'];

/** Get wallet balance for a party as of the end of a specific round */
export class GetWalletBalance extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/wallet-balance?party_id=${encodeURIComponent(validated.partyId)}&asOfEndOfRound=${validated.asOfEndOfRound}`
    );
  }
}
