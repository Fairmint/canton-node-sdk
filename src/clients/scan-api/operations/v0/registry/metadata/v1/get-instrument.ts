import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type ApiPath = '/registry/metadata/v1/instruments/{instrumentId}';

const endpoint = '/registry/metadata/v1/instruments';
const publicRequestConfig = { contentType: 'application/json', includeBearerToken: false } as const;

function getRegistryApiUrl(scanApiUrl: string): string {
  return scanApiUrl.replace(/\/api\/scan\/?$/, '').replace(/\/$/, '');
}

export const GetInstrumentParamsSchema = z.object({
  instrumentId: z.string(),
});

export type GetInstrumentParams = z.infer<typeof GetInstrumentParamsSchema>;
export type GetInstrumentResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

type RawGetInstrumentResponse = Omit<GetInstrumentResponse, 'totalSupply' | 'totalSupplyAsOf'> & {
  totalSupply?: string | null;
  totalSupplyAsOf?: string | null;
};

function normalizeInstrumentResponse(response: GetInstrumentResponse): GetInstrumentResponse {
  const raw = response as RawGetInstrumentResponse;
  const { totalSupply, totalSupplyAsOf, ...instrument } = raw;
  const normalized: GetInstrumentResponse = { ...instrument };
  if (totalSupply != null) {
    normalized.totalSupply = totalSupply;
  }
  if (totalSupplyAsOf != null) {
    normalized.totalSupplyAsOf = totalSupplyAsOf;
  }
  return normalized;
}

/** Retrieve an instrument's token metadata from the public Scan API. */
export const GetInstrument = createApiOperation<GetInstrumentParams, GetInstrumentResponse>({
  paramsSchema: GetInstrumentParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl): string =>
    `${getRegistryApiUrl(apiUrl)}${endpoint}/${encodeURIComponent(params.instrumentId)}`,
  requestConfig: publicRequestConfig,
  transformResponse: normalizeInstrumentResponse,
});
