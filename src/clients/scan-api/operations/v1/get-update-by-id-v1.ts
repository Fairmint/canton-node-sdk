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
type Response = operations['getUpdateByIdV1']['responses']['200']['content']['application/json'];

/**
 * Get update by ID (v1 - deprecated)
 * @deprecated Use v2 endpoint instead
 */
export class GetUpdateByIdV1 extends ScanApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const validated = this.validateParams(params, ParamsSchema);
    const queryString = validated.damlValueEncoding ? `?daml_value_encoding=${validated.damlValueEncoding}` : '';
    return this.makeGetRequest<Response>(
      `/api/scan/v1/updates/${encodeURIComponent(validated.updateId)}${queryString}`
    );
  }
}
