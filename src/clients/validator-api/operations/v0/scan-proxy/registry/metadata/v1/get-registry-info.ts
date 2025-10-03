import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { paths } from '../../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type ApiPath = '/registry/metadata/v1/info';
type Endpoint = '/api/validator/v0/scan-proxy/registry/metadata/v1/info';

export type GetRegistryInfoResponse = paths[ApiPath]['get']['responses']['200']['content']['application/json'];

/**
 * Get information about the registry including supported standards
 *
 * @example
 *   ```typescript
 *   const info = await client.getRegistryInfo();
 *   
 *   
 *   ```
 */
export const GetRegistryInfo = createApiOperation<void, GetRegistryInfoResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}${endpoint}`,
});
