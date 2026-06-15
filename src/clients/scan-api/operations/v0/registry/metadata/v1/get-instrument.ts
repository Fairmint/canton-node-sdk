import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type ApiPath = '/registry/metadata/v1/instruments/{instrumentId}';

const endpoint = '/registry/metadata/v1/instruments';
const publicRequestConfig = { contentType: 'application/json', includeBearerToken: false } as const;

export const GetInstrumentParamsSchema = z.object({
  instrumentId: z.string(),
});

export type GetInstrumentParams = z.infer<typeof GetInstrumentParamsSchema>;
export type GetInstrumentResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

/** Retrieve an instrument's token metadata from the public Scan API. */
export const GetInstrument = createApiOperation<GetInstrumentParams, GetInstrumentResponse>({
  paramsSchema: GetInstrumentParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}${endpoint}/${encodeURIComponent(params.instrumentId)}`,
  requestConfig: publicRequestConfig,
});
