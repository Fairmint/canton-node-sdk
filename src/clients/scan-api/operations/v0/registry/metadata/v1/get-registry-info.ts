import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';
import { getRegistryApiUrl, publicRegistryRequestConfig } from './registry-metadata';

type ApiPath = '/registry/metadata/v1/info';

const endpoint = '/registry/metadata/v1/info';

export type GetRegistryInfoResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

/** Retrieve information about the token registry and its supported standards from the public Scan API. */
export const GetRegistryInfo = createApiOperation<void, GetRegistryInfoResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl): string => `${getRegistryApiUrl(apiUrl)}${endpoint}`,
  requestConfig: publicRegistryRequestConfig,
});
