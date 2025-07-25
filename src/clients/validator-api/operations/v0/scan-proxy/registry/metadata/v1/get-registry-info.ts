import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

const apiPath = '/registry/metadata/v1/info';
const endpoint = '/api/validator/v0/scan-proxy/registry/metadata/v1/info';

export type GetRegistryInfoResponse = paths[typeof apiPath]['get']['responses']['200']['content']['application/json'];

/**
 * @description Get information about the registry including supported standards
 * @example
 * ```typescript
 * const info = await client.getRegistryInfo();
 * console.log(`Admin ID: ${info.adminId}`);
 * console.log(`Supported APIs: ${Object.keys(info.supportedApis)}`);
 * ```
 */
export const GetRegistryInfo = createApiOperation<
  void,
  GetRegistryInfoResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}${endpoint}`,
}); 