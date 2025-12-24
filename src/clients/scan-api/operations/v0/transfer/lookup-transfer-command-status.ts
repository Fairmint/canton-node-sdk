import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Sender party ID */
  sender: z.string(),
  /** Nonce for the transfer command */
  nonce: z.number(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['lookupTransferCommandStatus']['responses']['200']['content']['application/json'];

/** Lookup transfer command status by sender and nonce */
export class LookupTransferCommandStatus extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    return this.makeGetRequest<Response>(
      `/api/scan/v0/transfer-command-status?sender=${encodeURIComponent(validated.sender)}&nonce=${validated.nonce}`
    );
  }
}
