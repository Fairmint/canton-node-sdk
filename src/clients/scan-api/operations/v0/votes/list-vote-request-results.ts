import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z
  .object({
    /** Action name to filter by */
    actionName: z.string().optional(),
    /** Whether the vote was accepted */
    accepted: z.boolean().optional(),
    /** Requirer party ID */
    requirer: z.string().optional(),
    /** Effective from date */
    effectiveFrom: z.string().optional(),
    /** Effective to date */
    effectiveTo: z.string().optional(),
    /** Maximum number of results */
    limit: z.number().optional(),
  })
  .optional();

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listVoteRequestResults']['responses']['200']['content']['application/json'];

/** List vote request results with optional filters */
export class ListVoteRequestResults extends ScanApiOperation<Params, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    return this.makePostRequest<Response>('/api/scan/v0/dso-rules-vote-results', {
      action_name: validated.actionName,
      accepted: validated.accepted,
      requirer: validated.requirer,
      effective_from: validated.effectiveFrom,
      effective_to: validated.effectiveTo,
      limit: validated.limit,
    });
  }
}
