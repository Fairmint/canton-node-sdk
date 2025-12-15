import { z } from 'zod';
import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

const ParamsSchema = z.object({
  /** Maximum number of results to return */
  pageSize: z.number(),
  /** Filter entries starting with this prefix */
  namePrefix: z.string().optional(),
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['listAnsEntries']['responses']['200']['content']['application/json'];

/** List ANS (Amulet Name Service) entries */
export class ListAnsEntries extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryParts = [`page_size=${validated.pageSize}`];
    if (validated.namePrefix) {
      queryParts.push(`name_prefix=${encodeURIComponent(validated.namePrefix)}`);
    }
    return this.makeGetRequest<Response>(`/api/scan/v0/ans-entries?${queryParts.join('&')}`);
  }
}
