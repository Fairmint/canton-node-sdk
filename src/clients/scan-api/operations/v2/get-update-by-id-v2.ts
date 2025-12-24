import { z } from 'zod';
import { type operations } from '../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../ScanApiOperation';

const DamlValueEncodingSchema = z.enum(['proto', 'json']).optional();

const ParamsSchema = z.object({
  /** Update ID to look up */
  updateId: z.string(),
  /** DAML value encoding format */
  damlValueEncoding: DamlValueEncodingSchema,
});

type Params = z.infer<typeof ParamsSchema>;
type Response = operations['getUpdateByIdV2']['responses']['200']['content']['application/json'];

/** Get update by ID (v2 - recommended) */
export class GetUpdateByIdV2 extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryString = validated.damlValueEncoding ? `?daml_value_encoding=${validated.damlValueEncoding}` : '';
    return this.makeGetRequest<Response>(
      `/api/scan/v2/updates/${encodeURIComponent(validated.updateId)}${queryString}`
    );
  }
}
