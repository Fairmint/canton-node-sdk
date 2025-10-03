import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { paths } from '../../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type ApiPath = '/registry/metadata/v1/instruments/{instrumentId}';

const endpoint = '/api/validator/v0/scan-proxy/registry/metadata/v1/instruments';

export const GetInstrumentParamsSchema = z.object({
  instrumentId: z.string(),
});

export type GetInstrumentParams = z.infer<typeof GetInstrumentParamsSchema>;
export type GetInstrumentResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

/**
 * Retrieve an instrument's metadata
 *
 * @example
 *   ```typescript
 *   const instrument = await client.getInstrument({ instrumentId: 'instrument123' });
 *
 *   ```;
 */
export const GetInstrument = createApiOperation<GetInstrumentParams, GetInstrumentResponse>({
  paramsSchema: GetInstrumentParamsSchema,
  method: 'GET',
  buildUrl: (params: GetInstrumentParams, apiUrl: string) => `${apiUrl}${endpoint}/${params.instrumentId}`,
});
