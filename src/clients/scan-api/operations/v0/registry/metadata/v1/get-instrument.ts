import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';
import {
  getRegistryApiUrl,
  normalizeRegistryInstrument,
  publicRegistryRequestConfig,
  type RegistryInstrument,
} from './registry-metadata';

type ApiPath = '/registry/metadata/v1/instruments/{instrumentId}';

const endpoint = '/registry/metadata/v1/instruments';
export type GetInstrumentParams = paths[ApiPath]['get']['parameters']['path'];
type GetInstrumentParamsSchemaShape = {
  [Key in keyof GetInstrumentParams]-?: z.ZodType<GetInstrumentParams[Key], GetInstrumentParams[Key]>;
};

export const GetInstrumentParamsSchema = z.strictObject({
  instrumentId: z.string(),
} satisfies GetInstrumentParamsSchemaShape);

export type GetInstrumentResponse = RegistryInstrument;

/** Retrieve an instrument's token metadata from the public Scan API. */
export const GetInstrument = createApiOperation<GetInstrumentParams, GetInstrumentResponse>({
  paramsSchema: GetInstrumentParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl): string =>
    `${getRegistryApiUrl(apiUrl)}${endpoint}/${encodeURIComponent(params.instrumentId)}`,
  requestConfig: publicRegistryRequestConfig,
  transformResponse: normalizeRegistryInstrument,
});
