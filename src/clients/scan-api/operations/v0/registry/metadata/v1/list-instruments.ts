import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';
import { getScanHostRoot } from '../../../../../scan-endpoints';
import { normalizeRegistryInstrument, publicRegistryRequestConfig } from './registry-metadata';

type ApiPath = '/registry/metadata/v1/instruments';

const endpoint = '/registry/metadata/v1/instruments';

type GeneratedListInstrumentsParams = NonNullable<paths[ApiPath]['get']['parameters']['query']>;
export type ListInstrumentsParams = GeneratedListInstrumentsParams;
type ListInstrumentsParamsSchemaShape = {
  [Key in keyof ListInstrumentsParams]-?: z.ZodType<ListInstrumentsParams[Key], ListInstrumentsParams[Key]>;
};

const RawListInstrumentsParamsSchema = z.strictObject({
  pageSize: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  pageToken: z.string().optional(),
} satisfies ListInstrumentsParamsSchemaShape);

export const ListInstrumentsParamsSchema = RawListInstrumentsParamsSchema.transform((params): ListInstrumentsParams => {
  const normalized: ListInstrumentsParams = {};
  if (params.pageSize !== undefined) {
    normalized.pageSize = params.pageSize;
  }
  if (params.pageToken !== undefined) {
    normalized.pageToken = params.pageToken;
  }
  return normalized;
});

export type ListInstrumentsResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

type RawListInstrumentsResponse = Omit<ListInstrumentsResponse, 'nextPageToken'> & {
  nextPageToken?: string | null;
};

function normalizeListInstrumentsResponse(response: ListInstrumentsResponse): ListInstrumentsResponse {
  const { nextPageToken, ...raw } = response as RawListInstrumentsResponse;
  const normalized: ListInstrumentsResponse = {
    ...raw,
    instruments: raw.instruments.map(normalizeRegistryInstrument),
  };

  if (nextPageToken != null) {
    normalized.nextPageToken = nextPageToken;
  }

  return normalized;
}

/** List token instruments exposed by the public Scan registry metadata API. */
export const ListInstruments = createApiOperation<ListInstrumentsParams, ListInstrumentsResponse>({
  paramsSchema: ListInstrumentsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl): string => {
    const query = new URLSearchParams();
    if (params.pageSize !== undefined) {
      query.set('pageSize', String(params.pageSize));
    }
    if (params.pageToken !== undefined) {
      query.set('pageToken', params.pageToken);
    }

    const queryString = query.toString();
    return `${getScanHostRoot(apiUrl)}${endpoint}${queryString ? `?${queryString}` : ''}`;
  },
  requestConfig: publicRegistryRequestConfig,
  transformResponse: normalizeListInstrumentsResponse,
});
